const express = require("express")
const path = require("path")
const db = require("./database") // Import database connection
const bodyParser = require("body-parser")
const app = express()
const PORT = 3000 // Server will run on http://localhost:3000
const Razorpay = require("razorpay")
const fs = require("fs")
const { Parser } = require("json2csv")

// Replace with your Razorpay Key ID & Secret
const razorpay = new Razorpay({
  key_id: "YOUR_KEY_ID",
  key_secret: "YOUR_KEY_SECRET",
})

app.use(bodyParser.json())
// Middleware to serve static files from 'public' folder
app.use(express.static(path.join(__dirname, "public")))

// Create a new group
app.post("/api/create-group", (req, res) => {
  const { name, password, creatorName, budget } = req.body

  if (!name || !password || !creatorName) {
    return res.status(400).json({ error: "Group name, password, and creator name are required." })
  }

  // Check if the group already exists
  db.get(`SELECT id FROM groups WHERE name = ?`, [name], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (row) {
      return res.status(409).json({ error: "Group name already exists. Please choose another name." })
    }

    // Create the group
    const sql = `INSERT INTO groups (name, password, creator_name, budget) VALUES (?, ?, ?, ?)`
    db.run(sql, [name, password, creatorName, budget || 0], function (err) {
      if (err) {
        return res.status(500).json({ error: "Error creating group." })
      }

      const groupId = this.lastID

      // Add creator as the first user
      const addUserSql = `INSERT INTO users (name, group_id) VALUES (?, ?)`
      db.run(addUserSql, [creatorName, groupId], (err) => {
        if (err) {
          return res.status(500).json({ error: "Error adding creator to group." })
        }

        // Set default budget alerts (75% and 90%)
        const alertsSql = `INSERT INTO budget_alerts (group_id, threshold_percentage) VALUES (?, ?), (?, ?)`
        db.run(alertsSql, [groupId, 75, groupId, 90], (err) => {
          if (err) {
            console.error("Error setting default budget alerts:", err)
          }
        })

        res.status(201).json({
          message: "Group created successfully!",
          groupId: groupId,
          isCreator: true,
          creatorName: creatorName,
        })
      })
    })
  })
})

// Join an existing group
app.post("/api/join-group", (req, res) => {
  const { name, password, userName } = req.body

  if (!name || !password || !userName) {
    return res.status(400).json({ error: "Group name, password, and username are required." })
  }

  // Check if the group exists and password matches
  const sql = `SELECT id, creator_name FROM groups WHERE name = ? AND password = ?`
  db.get(sql, [name, password], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (!group) {
      return res.status(404).json({ error: "Invalid group name or password." })
    }

    // Check if username already exists in this group
    db.get(`SELECT id FROM users WHERE name = ? AND group_id = ?`, [userName, group.id], (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      // If user already exists, just let them in (this is the change)
      const isCreator = userName === group.creator_name

      if (existingUser) {
        return res.status(200).json({
          message: "Welcome back to the group!",
          groupId: group.id,
          isCreator: isCreator,
          creatorName: group.creator_name,
        })
      }

      // Add new user to the group
      const addUserSql = `INSERT INTO users (name, group_id) VALUES (?, ?)`
      db.run(addUserSql, [userName, group.id], (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to join group." })
        }

        res.status(200).json({
          message: "Group joined successfully!",
          groupId: group.id,
          isCreator: isCreator,
          creatorName: group.creator_name,
        })
      })
    })
  })
})

// Add user to a group
app.post("/add-user", (req, res) => {
  const { name, group_id } = req.body

  if (!name || !group_id) {
    return res.status(400).json({ error: "Username and group ID are required." })
  }

  const sql = `INSERT INTO users (name, group_id) VALUES (?, ?)`
  db.run(sql, [name, group_id], function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to add user." })
    }
    res.status(201).json({ message: "User added successfully!", userId: this.lastID })
  })
})

// Get all users in a group
app.get("/api/users/:group_id", (req, res) => {
  const group_id = req.params.group_id

  const sql = `SELECT id, name FROM users WHERE group_id = ?`
  db.all(sql, [group_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch users." })
    }
    res.json(rows)
  })
})

// Get group info
app.get("/api/group/:group_id", (req, res) => {
  const group_id = req.params.group_id

  const sql = `SELECT id, name, creator_name, budget FROM groups WHERE id = ?`
  db.get(sql, [group_id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch group info." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    res.json(group)
  })
})

// Update group budget
app.put("/api/update-budget/:group_id", (req, res) => {
  const group_id = req.params.group_id
  const { budget, creator_name } = req.body

  if (budget === undefined || !creator_name) {
    return res.status(400).json({ error: "Budget and creator name are required." })
  }

  // Verify that the request is from the creator
  db.get(`SELECT creator_name FROM groups WHERE id = ?`, [group_id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    if (group.creator_name !== creator_name) {
      return res.status(403).json({ error: "Only the group creator can update the budget." })
    }

    // Update the budget
    const sql = `UPDATE groups SET budget = ? WHERE id = ?`
    db.run(sql, [budget, group_id], function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to update budget." })
      }

      res.json({ message: "Budget updated successfully!" })
    })
  })
})

// Get budget alerts
app.get("/api/budget-alerts/:group_id", (req, res) => {
  const group_id = req.params.group_id

  const sql = `SELECT * FROM budget_alerts WHERE group_id = ? ORDER BY threshold_percentage`
  db.all(sql, [group_id], (err, alerts) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch budget alerts." })
    }

    res.json(alerts)
  })
})

// Update budget alert
app.put("/api/budget-alerts/:alert_id", (req, res) => {
  const alert_id = req.params.alert_id
  const { threshold_percentage, is_active, creator_name } = req.body

  if (threshold_percentage === undefined || is_active === undefined || !creator_name) {
    return res.status(400).json({ error: "All fields are required." })
  }

  // Get the alert and verify group creator
  db.get(
    `SELECT ba.id, ba.group_id, g.creator_name 
     FROM budget_alerts ba 
     JOIN groups g ON ba.group_id = g.id 
     WHERE ba.id = ?`,
    [alert_id],
    (err, alert) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      if (!alert) {
        return res.status(404).json({ error: "Alert not found." })
      }

      if (alert.creator_name !== creator_name) {
        return res.status(403).json({ error: "Only the group creator can update alerts." })
      }

      // Update the alert
      const sql = `UPDATE budget_alerts SET threshold_percentage = ?, is_active = ? WHERE id = ?`
      db.run(sql, [threshold_percentage, is_active ? 1 : 0, alert_id], function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to update alert." })
        }

        res.json({ message: "Alert updated successfully!" })
      })
    },
  )
})

// Add a new budget alert
app.post("/api/budget-alerts", (req, res) => {
  const { group_id, threshold_percentage, creator_name } = req.body

  if (!group_id || threshold_percentage === undefined || !creator_name) {
    return res.status(400).json({ error: "All fields are required." })
  }

  // Verify that the request is from the creator
  db.get(`SELECT creator_name FROM groups WHERE id = ?`, [group_id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    if (group.creator_name !== creator_name) {
      return res.status(403).json({ error: "Only the group creator can add alerts." })
    }

    // Add the alert
    const sql = `INSERT INTO budget_alerts (group_id, threshold_percentage) VALUES (?, ?)`
    db.run(sql, [group_id, threshold_percentage], function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to add alert." })
      }

      res.status(201).json({ message: "Alert added successfully!", alertId: this.lastID })
    })
  })
})

// Delete a budget alert
app.delete("/api/budget-alerts/:alert_id", (req, res) => {
  const alert_id = req.params.alert_id
  const creator_name = req.query.creator_name

  if (!creator_name) {
    return res.status(400).json({ error: "Creator name is required." })
  }

  // Get the alert and verify group creator
  db.get(
    `SELECT ba.id, ba.group_id, g.creator_name 
     FROM budget_alerts ba 
     JOIN groups g ON ba.group_id = g.id 
     WHERE ba.id = ?`,
    [alert_id],
    (err, alert) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      if (!alert) {
        return res.status(404).json({ error: "Alert not found." })
      }

      if (alert.creator_name !== creator_name) {
        return res.status(403).json({ error: "Only the group creator can delete alerts." })
      }

      // Delete the alert
      const sql = `DELETE FROM budget_alerts WHERE id = ?`
      db.run(sql, [alert_id], function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to delete alert." })
        }

        res.json({ message: "Alert deleted successfully!" })
      })
    },
  )
})

// Add an expense (only creator can do this)
app.post("/api/add-expense", (req, res) => {
  const { group_id, payer, amount, description, split_among, creator_name, split_type, split_values } = req.body

  if (!group_id || !payer || !amount || !description || !split_among || !creator_name) {
    return res.status(400).json({ error: "All fields are required." })
  }

  // Verify that the request is from the creator
  db.get(`SELECT creator_name, budget FROM groups WHERE id = ?`, [group_id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    if (group.creator_name !== creator_name) {
      return res.status(403).json({ error: "Only the group creator can add expenses." })
    }

    // Add the expense
    const sql = `INSERT INTO expenses (group_id, payer, amount, description, split_among, split_type, split_values) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`
    db.run(
      sql,
      [
        group_id,
        payer,
        amount,
        description,
        split_among,
        split_type || "equal",
        split_values ? JSON.stringify(split_values) : null,
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to add expense." })
        }

        // Check if this expense exceeds budget alerts
        if (group.budget > 0) {
          // Get total expenses for this group
          db.get(`SELECT SUM(amount) as total FROM expenses WHERE group_id = ?`, [group_id], (err, result) => {
            if (!err && result && result.total) {
              const totalExpenses = result.total
              const budgetPercentage = (totalExpenses / group.budget) * 100

              // Get triggered alerts
              db.all(
                `SELECT * FROM budget_alerts 
                 WHERE group_id = ? AND is_active = 1 AND threshold_percentage <= ?
                 ORDER BY threshold_percentage DESC`,
                [group_id, budgetPercentage],
                (err, alerts) => {
                  if (!err && alerts && alerts.length > 0) {
                    // Return the highest triggered alert
                    const highestAlert = alerts[0]
                    return res.status(201).json({
                      message: "Expense added successfully!",
                      expenseId: this.lastID,
                      budgetAlert: {
                        percentage: highestAlert.threshold_percentage,
                        currentUsage: budgetPercentage.toFixed(2),
                        budget: group.budget,
                        spent: totalExpenses,
                      },
                    })
                  } else {
                    return res.status(201).json({
                      message: "Expense added successfully!",
                      expenseId: this.lastID,
                    })
                  }
                },
              )
            } else {
              return res.status(201).json({
                message: "Expense added successfully!",
                expenseId: this.lastID,
              })
            }
          })
        } else {
          return res.status(201).json({
            message: "Expense added successfully!",
            expenseId: this.lastID,
          })
        }
      },
    )
  })
})

// Edit an expense (only creator can do this)
app.put("/api/edit-expense/:expense_id", (req, res) => {
  const expense_id = req.params.expense_id
  const { payer, amount, description, split_among, creator_name, split_type, split_values } = req.body

  if (!payer || !amount || !description || !split_among || !creator_name) {
    return res.status(400).json({ error: "All fields are required." })
  }

  // Get the expense and verify group creator
  db.get(
    `SELECT e.id, e.group_id, g.creator_name, g.budget
     FROM expenses e 
     JOIN groups g ON e.group_id = g.id 
     WHERE e.id = ?`,
    [expense_id],
    (err, expense) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      if (!expense) {
        return res.status(404).json({ error: "Expense not found." })
      }

      if (expense.creator_name !== creator_name) {
        return res.status(403).json({ error: "Only the group creator can edit expenses." })
      }

      // Update the expense
      const sql = `UPDATE expenses SET payer = ?, amount = ?, description = ?, split_among = ?, 
                  split_type = ?, split_values = ? WHERE id = ?`
      db.run(
        sql,
        [
          payer,
          amount,
          description,
          split_among,
          split_type || "equal",
          split_values ? JSON.stringify(split_values) : null,
          expense_id,
        ],
        function (err) {
          if (err) {
            return res.status(500).json({ error: "Failed to update expense." })
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: "Expense not found." })
          }

          // Check if budget alerts are triggered after update
          if (expense.budget > 0) {
            // Get total expenses for this group
            db.get(`SELECT SUM(amount) as total FROM expenses WHERE group_id = ?`, [expense.group_id], (err, result) => {
              if (!err && result && result.total) {
                const totalExpenses = result.total
                const budgetPercentage = (totalExpenses / expense.budget) * 100

                // Get triggered alerts
                db.all(
                  `SELECT * FROM budget_alerts 
                   WHERE group_id = ? AND is_active = 1 AND threshold_percentage <= ?
                   ORDER BY threshold_percentage DESC`,
                  [expense.group_id, budgetPercentage],
                  (err, alerts) => {
                    if (!err && alerts && alerts.length > 0) {
                      // Return the highest triggered alert
                      const highestAlert = alerts[0]
                      return res.json({
                        message: "Expense updated successfully!",
                        budgetAlert: {
                          percentage: highestAlert.threshold_percentage,
                          currentUsage: budgetPercentage.toFixed(2),
                          budget: expense.budget,
                          spent: totalExpenses,
                        },
                      })
                    } else {
                      return res.json({ message: "Expense updated successfully!" })
                    }
                  },
                )
              } else {
                return res.json({ message: "Expense updated successfully!" })
              }
            })
          } else {
            return res.json({ message: "Expense updated successfully!" })
          }
        },
      )
    },
  )
})

// Delete an expense (only creator can do this)
app.delete("/api/delete-expense/:expense_id", (req, res) => {
  const expense_id = req.params.expense_id
  const creator_name = req.query.creator_name

  if (!creator_name) {
    return res.status(400).json({ error: "Creator name is required." })
  }

  // Get the expense and verify group creator
  db.get(
    `SELECT e.id, e.group_id, g.creator_name 
     FROM expenses e 
     JOIN groups g ON e.group_id = g.id 
     WHERE e.id = ?`,
    [expense_id],
    (err, expense) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      if (!expense) {
        return res.status(404).json({ error: "Expense not found." })
      }

      if (expense.creator_name !== creator_name) {
        return res.status(403).json({ error: "Only the group creator can delete expenses." })
      }

      // Delete the expense
      const sql = `DELETE FROM expenses WHERE id = ?`
      db.run(sql, [expense_id], function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to delete expense." })
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: "Expense not found." })
        }

        res.json({ message: "Expense deleted successfully!" })
      })
    },
  )
})

// Get all expenses for a group
app.get("/api/expenses/:group_id", (req, res) => {
  const group_id = req.params.group_id

  const sql = `SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC`
  db.all(sql, [group_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch expenses." })
    }
    res.json(rows)
  })
})

// Get group balance summary
app.get("/group-balance/:group_id", (req, res) => {
  const group_id = req.params.group_id

  const sql = `
    SELECT payer, SUM(amount) as total_paid
    FROM expenses
    WHERE group_id = ?
    GROUP BY payer
  `

  db.all(sql, [group_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch group balance." })
    }
    res.json(rows)
  })
})

// Get budget status
app.get("/api/budget-status/:group_id", (req, res) => {
  const group_id = req.params.group_id

  // Get group budget
  db.get(`SELECT budget FROM groups WHERE id = ?`, [group_id], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch group budget." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    // Get total expenses
    db.get(`SELECT SUM(amount) as total FROM expenses WHERE group_id = ?`, [group_id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: "Failed to calculate total expenses." })
      }

      const totalExpenses = result.total || 0
      const budget = group.budget || 0
      const remaining = budget - totalExpenses
      const percentage = budget > 0 ? (totalExpenses / budget) * 100 : 0

      res.json({
        budget: budget,
        spent: totalExpenses,
        remaining: remaining,
        percentage: percentage.toFixed(2),
      })
    })
  })
})

// Get optimized debt settlements for a group
app.get("/api/settlements/:group_id", (req, res) => {
  const group_id = req.params.group_id

  // Get all expenses for the group
  db.all(
    `SELECT id, payer, amount, split_among, split_type, split_values FROM expenses WHERE group_id = ?`,
    [group_id],
    (err, expenses) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch expenses." })
      }

      if (expenses.length === 0) {
        return res.json([])
      }

      // Calculate balances for each user
      const balances = {}

      expenses.forEach((expense) => {
        const payer = expense.payer
        const amount = Number.parseFloat(expense.amount)
        const splitAmong = expense.split_among.split(",").map((name) => name.trim())
        const splitType = expense.split_type || "equal"
        let splitValues = null

        try {
          if (expense.split_values) {
            splitValues = JSON.parse(expense.split_values)
          }
        } catch (e) {
          console.error("Error parsing split values:", e)
        }

        // Initialize balances for all users involved
        if (!balances[payer]) balances[payer] = 0
        splitAmong.forEach((person) => {
          if (!balances[person]) balances[person] = 0
        })

        // Add the full amount to the payer's balance
        balances[payer] += amount

        // Calculate each person's share based on split type
        if (splitType === "equal") {
          // Equal split
          const sharePerPerson = amount / splitAmong.length
          splitAmong.forEach((person) => {
            balances[person] -= sharePerPerson
          })
        } else if (splitType === "percentage" && splitValues) {
          // Percentage-based split
          splitAmong.forEach((person) => {
            const percentage = splitValues[person] || 0
            const share = (amount * percentage) / 100
            balances[person] -= share
          })
        } else if (splitType === "fixed" && splitValues) {
          // Fixed amount split
          splitAmong.forEach((person) => {
            const fixedAmount = splitValues[person] || 0
            balances[person] -= fixedAmount
          })
        } else if (splitType === "shares" && splitValues) {
          // Share-based split
          const totalShares = Object.values(splitValues).reduce((sum, share) => sum + (Number(share) || 0), 0)
          if (totalShares > 0) {
            splitAmong.forEach((person) => {
              const shares = splitValues[person] || 0
              const share = (amount * shares) / totalShares
              balances[person] -= share
            })
          }
        } else {
          // Fallback to equal split if split type is invalid
          const sharePerPerson = amount / splitAmong.length
          splitAmong.forEach((person) => {
            balances[person] -= sharePerPerson
          })
        }
      })

      // Separate creditors (positive balance) and debtors (negative balance)
      const creditors = [],
        debtors = []
      for (const person in balances) {
        if (balances[person] > 0.01) {
          // Using small threshold to handle floating point errors
          creditors.push({ name: person, amount: balances[person] })
        } else if (balances[person] < -0.01) {
          debtors.push({ name: person, amount: -balances[person] })
        }
      }

      // Sort by amount (largest first) to optimize transactions
      creditors.sort((a, b) => b.amount - a.amount)
      debtors.sort((a, b) => b.amount - a.amount)

      // Calculate settlements
      const settlements = []
      let i = 0,
        j = 0

      while (i < debtors.length && j < creditors.length) {
        const pay = Math.min(creditors[j].amount, debtors[i].amount)

        if (pay > 0.01) {
          // Only add meaningful transactions
          settlements.push({
            from: debtors[i].name,
            to: creditors[j].name,
            amount: pay.toFixed(2),
          })
        }

        creditors[j].amount -= pay
        debtors[i].amount -= pay

        if (creditors[j].amount < 0.01) j++ // Move to next creditor
        if (debtors[i].amount < 0.01) i++ // Move to next debtor
      }

      res.json(settlements)
    },
  )
})

// Export expenses as CSV
app.get("/api/export/csv/:group_id", (req, res) => {
  const group_id = req.params.group_id

  // Get group name
  db.get(`SELECT name FROM groups WHERE id = ?`, [group_id], (err, group) => {
    if (err || !group) {
      return res.status(500).json({ error: "Failed to fetch group info." })
    }

    // Get all expenses for the group
    db.all(
      `SELECT e.*, u.name as creator_name
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       LEFT JOIN users u ON u.name = g.creator_name
       WHERE e.group_id = ?
       ORDER BY e.created_at DESC`,
      [group_id],
      (err, expenses) => {
        if (err) {
          return res.status(500).json({ error: "Failed to fetch expenses." })
        }

        if (expenses.length === 0) {
          return res.status(404).json({ error: "No expenses found." })
        }

        try {
          // Format expenses for CSV
          const fields = ["description", "amount", "payer", "split_among", "split_type", "created_at"]
          const opts = { fields }
          const parser = new Parser(opts)
          const csv = parser.parse(expenses)

          // Set headers for file download
          res.setHeader("Content-Type", "text/csv")
          res.setHeader("Content-Disposition", `attachment; filename=expenses-${group.name}.csv`)
          
          // Send CSV data
          res.send(csv)
        } catch (err) {
          console.error("Error generating CSV:", err)
          res.status(500).json({ error: "Failed to generate CSV." })
        }
      },
    )
  })
})

// Generate UPI payment link
app.post("/generate-payment", async (req, res) => {
  const { from, to, amount } = req.body

  if (!from || !to || !amount) {
    return res.status(400).json({ error: "All fields are required." })
  }

  try {
    // For Razorpay integration (if you have valid API keys)
    if (razorpay.key_id !== "YOUR_KEY_ID") {
      const options = {
        amount: Math.round(amount * 100), // Razorpay expects amount in paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1,
        notes: { from, to },
      }

      const order = await razorpay.orders.create(options)

      res.json({
        message: "Payment link generated",
        upi_link: `upi://pay?pa=your-merchant-id@ybl&pn=${encodeURIComponent(to)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Payment from ${from} to ${to}`)}`,
        razorpay_order_id: order.id,
      })
    } else {
      // Fallback for demo/testing (when Razorpay keys are not set)
      res.json({
        message: "Demo payment link generated",
        upi_link: `upi://pay?pa=demoVPA@ybl&pn=${encodeURIComponent(to)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Payment from ${from} to ${to}`)}`,
        demo_mode: true,
      })
    }
  } catch (error) {
    console.error("Payment error:", error)
    res.status(500).json({ error: "Error generating payment link" })
  }
})

// Default route to serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Add a new endpoint to check if a user exists in a group
app.get("/api/check-user", (req, res) => {
  const { groupName, userName } = req.query

  if (!groupName || !userName) {
    return res.status(400).json({ error: "Group name and username are required." })
  }

  // First get the group ID
  db.get(`SELECT id, creator_name FROM groups WHERE name = ?`, [groupName], (err, group) => {
    if (err) {
      return res.status(500).json({ error: "Database error occurred." })
    }

    if (!group) {
      return res.status(404).json({ error: "Group not found." })
    }

    // Check if user exists in this group
    db.get(`SELECT id FROM users WHERE name = ? AND group_id = ?`, [userName, group.id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: "Database error occurred." })
      }

      const isCreator = userName === group.creator_name

      res.json({
        exists: !!user,
        isCreator: isCreator,
        groupId: group.id,
        creatorName: group.creator_name,
      })
    })
  })
})

// Catch-all error handler for missing routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!" })
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`)
})
