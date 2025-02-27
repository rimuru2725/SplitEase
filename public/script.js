const API_URL = "http://localhost:3000/api" // Backend API URL
let currentGroupId = null
let currentGroupName = ""
let currentUserName = ""
let isCreator = false
let creatorName = ""
let allSettlements = [] // Store all settlements for filtering
let currentBudget = 0
let currentSplitType = "equal" // Default split type

// Show initial options
function showInitialOptions() {
  document.getElementById("initial-options").style.display = "block"
  document.getElementById("create-group-form").style.display = "none"
  document.getElementById("join-group-form").style.display = "none"
  document.getElementById("group-dashboard").style.display = "none"
}

// Show create group form
function showCreateGroupForm() {
  document.getElementById("initial-options").style.display = "none"
  document.getElementById("create-group-form").style.display = "block"
}

// Show join group form
function showJoinGroupForm() {
  document.getElementById("initial-options").style.display = "none"
  document.getElementById("join-group-form").style.display = "block"
}

// Show group dashboard
function showGroupDashboard() {
  document.getElementById("initial-options").style.display = "none"
  document.getElementById("create-group-form").style.display = "none"
  document.getElementById("join-group-form").style.display = "none"
  document.getElementById("group-dashboard").style.display = "block"

  // Update group name display
  document.querySelector("#group-name-display span").textContent = currentGroupName

  // Update user name display
  document.getElementById("user-name-display").textContent = currentUserName

  // Show/hide creator-specific elements
  if (isCreator) {
    document.getElementById("user-role-badge").textContent = "Creator"
    document.getElementById("user-role-badge").classList.replace("bg-primary", "bg-success")
    document.getElementById("creator-message").style.display = "block"
    document.getElementById("member-message").style.display = "none"
    document.getElementById("expense-form").style.display = "block"
    document.getElementById("actions-header").style.display = "table-cell"
    document.getElementById("budget-settings").style.display = "block"
  } else {
    document.getElementById("user-role-badge").textContent = "Member"
    document.getElementById("user-role-badge").classList.replace("bg-success", "bg-primary")
    document.getElementById("creator-message").style.display = "none"
    document.getElementById("member-message").style.display = "block"
    document.getElementById("expense-form").style.display = "none"
    document.getElementById("actions-header").style.display = "none"
    document.getElementById("budget-settings").style.display = "none"
  }

  // Load group data
  fetchUsers()
  fetchExpenses()
  fetchSettlements()
  fetchBudgetStatus()
}

// Create a new group
async function createGroup() {
  const groupName = document.getElementById("createGroupName").value
  const groupPassword = document.getElementById("createGroupPassword").value
  const creatorNameInput = document.getElementById("creatorName").value
  const budget = document.getElementById("createGroupBudget").value || 0

  if (!groupName || !groupPassword || !creatorNameInput) {
    alert("Please fill in all required fields.")
    return
  }

  try {
    const response = await fetch(`${API_URL}/create-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupName,
        password: groupPassword,
        creatorName: creatorNameInput,
        budget: Number(budget)
      }),
    })

    const result = await response.json()

    if (response.ok) {
      currentGroupId = result.groupId
      currentGroupName = groupName
      currentUserName = creatorNameInput
      isCreator = true
      creatorName = creatorNameInput
      currentBudget = Number(budget)

      saveSession() // Save session data
      alert(`Group "${groupName}" created successfully!`)
      showGroupDashboard()
    } else {
      alert(result.error || "Failed to create group")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Join an existing group
async function joinGroup() {
  const groupName = document.getElementById("joinGroupName").value
  const groupPassword = document.getElementById("joinGroupPassword").value
  const userName = document.getElementById("userName").value

  if (!groupName || !groupPassword || !userName) {
    alert("Please fill in all fields.")
    return
  }

  try {
    const response = await fetch(`${API_URL}/join-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupName,
        password: groupPassword,
        userName: userName,
      }),
    })

    const result = await response.json()

    if (response.ok) {
      currentGroupId = result.groupId
      currentGroupName = groupName
      currentUserName = userName
      isCreator = result.isCreator
      creatorName = result.creatorName

      saveSession() // Save session data
      alert(`Joined group "${groupName}" successfully!`)
      showGroupDashboard()
    } else {
      alert(result.error || "Failed to join group")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Fetch users in the current group
async function fetchUsers() {
  if (!currentGroupId) return

  try {
    const response = await fetch(`${API_URL}/users/${currentGroupId}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to fetch users")
    }

    const users = await response.json()

    // Populate payer dropdown
    const payerSelect = document.getElementById("expensePayer")
    payerSelect.innerHTML = ""

    users.forEach((user) => {
      const option = document.createElement("option")
      option.value = user.name
      option.textContent = user.name
      payerSelect.appendChild(option)
    })

    // Set current user as default payer
    const currentUserOption = Array.from(payerSelect.options).find((option) => option.value === currentUserName)
    if (currentUserOption) {
      currentUserOption.selected = true
    }

    // Populate split among checkboxes
    const splitAmongDiv = document.getElementById("split-among-checkboxes")
    splitAmongDiv.innerHTML = ""

    users.forEach((user) => {
      const div = document.createElement("div")
      div.className = "form-check"

      const input = document.createElement("input")
      input.type = "checkbox"
      input.className = "form-check-input split-among-checkbox"
      input.id = `split-${user.name}`
      input.value = user.name
      input.checked = true // Check all by default
      input.dataset.username = user.name

      const label = document.createElement("label")
      label.className = "form-check-label"
      label.htmlFor = `split-${user.name}`
      label.textContent = user.name

      div.appendChild(input)
      div.appendChild(label)

      splitAmongDiv.appendChild(div)
    })

    // Initialize custom split options
    updateSplitTypeUI()
  } catch (error) {
    console.error("Error fetching users:", error)
  }
}

// Update split type UI based on selected split type
function updateSplitTypeUI() {
  const splitType = document.getElementById("splitType").value
  currentSplitType = splitType
  
  document.getElementById("equal-split-section").style.display = "none"
  document.getElementById("percentage-split-section").style.display = "none"
  document.getElementById("fixed-split-section").style.display = "none"
  document.getElementById("shares-split-section").style.display = "none"
  
  // Show the appropriate split section
  document.getElementById(`${splitType}-split-section`).style.display = "block"
  
  // Populate the custom split inputs
  const selectedUsers = getSelectedUsers()
  
  if (splitType !== "equal") {
    const container = document.getElementById(`${splitType}-split-inputs`)
    container.innerHTML = ""
    
    selectedUsers.forEach(user => {
      const div = document.createElement("div")
      div.className = "mb-2"
      
      const label = document.createElement("label")
      label.className = "form-label"
      label.textContent = user
      
      const input = document.createElement("input")
      input.type = "number"
      input.className = "form-control form-control-sm"
      input.placeholder = splitType === "percentage" ? "Percentage %" : 
                          splitType === "fixed" ? "Amount" : "Shares"
      input.dataset.user = user
      input.min = "0"
      input.step = splitType === "shares" ? "1" : "0.01"
      
      div.appendChild(label)
      div.appendChild(input)
      container.appendChild(div)
    })
    
    // Auto-calculate equal values as a starting point
    if (splitType === "percentage" && selectedUsers.length > 0) {
      const equalPercentage = (100 / selectedUsers.length).toFixed(2)
      container.querySelectorAll("input").forEach(input => {
        input.value = equalPercentage
      })
    } else if (splitType === "shares" && selectedUsers.length > 0) {
      container.querySelectorAll("input").forEach(input => {
        input.value = "1"
      })
    }
  }
}

// Get selected users for split
function getSelectedUsers() {
  const splitCheckboxes = document.querySelectorAll(".split-among-checkbox:checked")
  return Array.from(splitCheckboxes).map(cb => cb.value)
}

// Update custom split inputs when user selection changes
function updateCustomSplitUsers() {
  if (currentSplitType !== "equal") {
    updateSplitTypeUI()
  }
}

// Validate custom split values
function validateSplitValues() {
  const splitType = currentSplitType
  
  if (splitType === "equal") {
    return true
  }
  
  const container = document.getElementById(`${splitType}-split-inputs`)
  const inputs = container.querySelectorAll("input")
  const values = Array.from(inputs).map(input => Number(input.value))
  
  // Check if all inputs have values
  if (values.some(isNaN)) {
    alert("Please fill in all split values.")
    return false
  }
  
  // For percentage split, check if sum is 100%
  if (splitType === "percentage") {
    const sum = values.reduce((total, val) => total + val, 0)
    if (Math.abs(sum - 100) > 0.01) {
      alert("Percentage values must sum to 100%.")
      return false
    }
  }
  
  // For fixed split, check if sum matches expense amount
  if (splitType === "fixed") {
    const expenseAmount = Number(document.getElementById("expenseAmount").value)
    const sum = values.reduce((total, val) => total + val, 0)
    if (Math.abs(sum - expenseAmount) > 0.01) {
      alert("Fixed amounts must sum to the total expense amount.")
      return false
    }
  }
  
  return true
}

// Get split values based on split type
function getSplitValues() {
  const splitType = currentSplitType
  
  if (splitType === "equal") {
    return null
  }
  
  const container = document.getElementById(`${splitType}-split-inputs`)
  const inputs = container.querySelectorAll("input")
  const splitValues = {}
  
  inputs.forEach(input => {
    splitValues[input.dataset.user] = Number(input.value)
  })
  
  return splitValues
}

// Add an expense
async function addExpense() {
  if (!currentGroupId || !isCreator) return

  const description = document.getElementById("expenseDescription").value
  const amount = document.getElementById("expenseAmount").value
  const payer = document.getElementById("expensePayer").value
  const splitType = currentSplitType

  // Get selected users for split
  const splitCheckboxes = document.querySelectorAll(".split-among-checkbox:checked")
  const splitAmong = Array.from(splitCheckboxes)
    .map((cb) => cb.value)
    .join(", ")

  if (!description || !amount || !payer || splitAmong.length === 0) {
    alert("Please fill in all fields and select at least one person to split with.")
    return
  }
  
  // Validate custom split values
  if (!validateSplitValues()) {
    return
  }
  
  // Get split values
  const splitValues = getSplitValues()

  try {
    const response = await fetch(`${API_URL}/add-expense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: currentGroupId,
        payer: payer,
        amount: Number.parseFloat(amount),
        description: description,
        split_among: splitAmong,
        creator_name: creatorName,
        split_type: splitType,
        split_values: splitValues
      }),
    })

    const result = await response.json()

    if (response.ok) {
      // Check if there's a budget alert
      if (result.budgetAlert) {
        const alert = result.budgetAlert
        showBudgetAlert(alert.percentage, alert.currentUsage, alert.budget, alert.spent)
      } else {
        alert(result.message || "Expense added successfully!")
      }

      // Clear form
      document.getElementById("expenseDescription").value = ""
      document.getElementById("expenseAmount").value = ""

      // Refresh data
      fetchExpenses()
      fetchSettlements()
      fetchBudgetStatus()
    } else {
      alert(result.error || "Failed to add expense")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Show budget alert
function showBudgetAlert(percentage, currentUsage, budget, spent) {
  const alertHTML = `
    <div class="alert alert-warning alert-dismissible fade show" role="alert">
      <strong>Budget Alert!</strong> You've reached ${percentage}% of your budget.
      <br>Budget: $${budget.toFixed(2)} | Spent: $${spent.toFixed(2)} | Usage: ${currentUsage}%
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `
  
  const alertContainer = document.getElementById("alerts-container")
  alertContainer.innerHTML = alertHTML
}

// Edit an expense
async function editExpense(expenseId) {
  if (!currentGroupId || !isCreator) return

  // Get current expense data
  const expenseRow = document.querySelector(`tr[data-expense-id="${expenseId}"]`)
  const description = prompt("Enter new description:", expenseRow.cells[0].textContent)
  if (!description) return

  const amount = prompt("Enter new amount:", expenseRow.cells[1].textContent.replace(/[^0-9.]/g, ""))
  if (!amount || isNaN(Number.parseFloat(amount))) return

  const currentPayer = expenseRow.cells[2].textContent
  const payer = prompt("Enter who paid:", currentPayer)
  if (!payer) return

  const currentSplitAmong = expenseRow.cells[3].textContent
  const splitAmong = prompt("Enter who to split among (comma separated):", currentSplitAmong)
  if (!splitAmong) return

  const splitTypeCell = expenseRow.querySelector(".split-type-value")
  const splitType = prompt("Enter split type (equal, percentage, fixed, shares):", 
                          splitTypeCell ? splitTypeCell.textContent : "equal")
  if (!["equal", "percentage", "fixed", "shares"].includes(splitType)) return

  // For custom splits, we need to get the values
  let splitValues = null
  if (splitType !== "equal") {
    const users = splitAmong.split(",").map(name => name.trim())
    splitValues = {}
    
    for (const user of users) {
      let value
      if (splitType === "percentage") {
        value = prompt(`Enter percentage for ${user} (0-100):`)
      } else if (splitType === "fixed") {
        value = prompt(`Enter fixed amount for ${user}:`)
      } else { // shares
        value = prompt(`Enter shares for ${user}:`)
      }
      
      if (!value || isNaN(Number(value))) return
      splitValues[user] = Number(value)
    }
    
    // Validate split values
    if (splitType === "percentage") {
      const sum = Object.values(splitValues).reduce((total, val) => total + val, 0)
      if (Math.abs(sum - 100) > 0.01) {
        alert("Percentage values must sum to 100%.")
        return
      }
    } else if (splitType === "fixed") {
      const sum = Object.values(splitValues).reduce((total, val) => total + val, 0)
      if (Math.abs(sum - Number.parseFloat(amount)) > 0.01) {
        alert("Fixed amounts must sum to the total expense amount.")
        return
      }
    }
  }

  try {
    const response = await fetch(`${API_URL}/edit-expense/${expenseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payer: payer,
        amount: Number.parseFloat(amount),
        description: description,
        split_among: splitAmong,
        creator_name: creatorName,
        split_type: splitType,
        split_values: splitValues
      }),
    })

    const result = await response.json()

    if (response.ok) {
      // Check if there's a budget alert
      if (result.budgetAlert) {
        const alert = result.budgetAlert
        showBudgetAlert(alert.percentage, alert.currentUsage, alert.budget, alert.spent)
      } else {
        alert(result.message || "Expense updated successfully!")
      }
      
      fetchExpenses()
      fetchSettlements()
      fetchBudgetStatus()
    } else {
      alert(result.error || "Failed to update expense")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Delete an expense
async function deleteExpense(expenseId) {
  if (!currentGroupId || !isCreator) return

  if (!confirm("Are you sure you want to delete this expense?")) {
    return
  }

  try {
    const response = await fetch(
      `${API_URL}/delete-expense/${expenseId}?creator_name=${encodeURIComponent(creatorName)}`,
      {
        method: "DELETE",
      },
    )

    const result = await response.json()

    if (response.ok) {
      alert(result.message || "Expense deleted successfully!")
      fetchExpenses()
      fetchSettlements()
      fetchBudgetStatus()
    } else {
      alert(result.error || "Failed to delete expense")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Fetch and display expenses
async function fetchExpenses() {
  if (!currentGroupId) return

  try {
    const response = await fetch(`${API_URL}/expenses/${currentGroupId}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to fetch expenses")
    }

    const expenses = await response.json()
    const expenseList = document.getElementById("expense-list")
    const noExpensesMessage = document.getElementById("no-expenses-message")

    expenseList.innerHTML = ""

    if (expenses.length === 0) {
      noExpensesMessage.style.display = "block"
    } else {
      noExpensesMessage.style.display = "none"

      expenses.forEach((expense) => {
        const row = document.createElement("tr")
        row.setAttribute("data-expense-id", expense.id)

        // Description
        const descCell = document.createElement("td")
        descCell.textContent = expense.description
        row.appendChild(descCell)

        // Amount
        const amountCell = document.createElement("td")
        amountCell.textContent = `$${Number.parseFloat(expense.amount).toFixed(2)}`
        row.appendChild(amountCell)

        // Payer
        const payerCell = document.createElement("td")
        payerCell.textContent = expense.payer
        row.appendChild(payerCell)

        // Split Among
        const splitCell = document.createElement("td")
        splitCell.textContent = expense.split_among
        row.appendChild(splitCell)

        // Split Type
        const splitTypeCell = document.createElement("td")
        const splitType = expense.split_type || "equal"
        splitTypeCell.innerHTML = `<span class="badge bg-info split-type-value">${splitType}</span>`
        
        // Add split values tooltip if available
        if (expense.split_values) {
          try {
            const splitValues = JSON.parse(expense.split_values)
            let tooltipContent = "<strong>Split Details:</strong><br>"
            
            for (const [user, value] of Object.entries(splitValues)) {
              if (splitType === "percentage") {
                tooltipContent += `${user}: ${value}%<br>`
              } else if (splitType === "fixed") {
                tooltipContent += `${user}: $${Number(value).toFixed(2)}<br>`
              } else { // shares
                tooltipContent += `${user}: ${value} shares<br>`
              }
            }
            
            splitTypeCell.setAttribute("data-bs-toggle", "tooltip")
            splitTypeCell.setAttribute("data-bs-html", "true")
            splitTypeCell.setAttribute("title", tooltipContent)
          } catch (e) {
            console.error("Error parsing split values:", e)
          }
        }
        
        row.appendChild(splitTypeCell)

        // Date
        const dateCell = document.createElement("td")
        const date = new Date(expense.created_at)
        dateCell.textContent = date.toLocaleDateString()
        row.appendChild(dateCell)

        // Actions (only for creator)
        if (isCreator) {
          const actionsCell = document.createElement("td")

          const editBtn = document.createElement("button")
          editBtn.className = "btn btn-sm btn-outline-primary me-1"
          editBtn.textContent = "Edit"
          editBtn.onclick = () => editExpense(expense.id)

          const deleteBtn = document.createElement("button")
          deleteBtn.className = "btn btn-sm btn-outline-danger"
          deleteBtn.textContent = "Delete"
          deleteBtn.onclick = () => deleteExpense(expense.id)

          actionsCell.appendChild(editBtn)
          actionsCell.appendChild(deleteBtn)
          row.appendChild(actionsCell)
        }

        expenseList.appendChild(row)
      })
      
      // Initialize tooltips
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
      const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
      })
    }
  } catch (error) {
    console.error("Error fetching expenses:", error)
  }
}

// Fetch and display settlements
async function fetchSettlements() {
  if (!currentGroupId) return

  try {
    const response = await fetch(`${API_URL}/settlements/${currentGroupId}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to fetch settlements")
    }

    const settlements = await response.json()
    allSettlements = settlements // Store all settlements

    displaySettlements(settlements)
    updateSettlementSummary(settlements)
  } catch (error) {
    console.error("Error fetching settlements:", error)
  }
}

function displaySettlements(settlements) {
  const settlementList = document.getElementById("settlement-list")
  const noSettlementsMessage = document.getElementById("no-settlements-message")

  settlementList.innerHTML = ""

  if (settlements.length === 0) {
    noSettlementsMessage.style.display = "block"
    document.getElementById("settlement-summary").style.display = "none"
  } else {
    noSettlementsMessage.style.display = "none"
    document.getElementById("settlement-summary").style.display = "block"

    settlements.forEach((settlement) => {
      const li = document.createElement("li")
      li.className = "list-group-item d-flex justify-content-between align-items-center"

      // Highlight settlements involving the current user
      if (settlement.from === currentUserName || settlement.to === currentUserName) {
        li.classList.add("list-group-item-primary")
      }

      const mainText = document.createElement("div")
      mainText.innerHTML = `<strong>${settlement.from}</strong> pays <span class="text-success fw-bold">$${settlement.amount}</span> to <strong>${settlement.to}</strong>`

      li.appendChild(mainText)

      // Add "I paid" button if the current user is the one who needs to pay
      if (settlement.from === currentUserName) {
        const paidBtn = document.createElement("button")
        paidBtn.className = "btn btn-sm btn-success"
        paidBtn.textContent = "Mark as Paid"
        paidBtn.onclick = () => {
          if (confirm(`Confirm that you paid $${settlement.amount} to ${settlement.to}?`)) {
            alert("Payment marked as completed! (In a real app, this would update the database)")
          }
        }
        li.appendChild(paidBtn)
      }

      // Add "Received" button if the current user is the one who gets paid
      if (settlement.to === currentUserName) {
        const receivedBtn = document.createElement("button")
        receivedBtn.className = "btn btn-sm btn-outline-success"
        receivedBtn.textContent = "Mark as Received"
        receivedBtn.onclick = () => {
          if (confirm(`Confirm that you received $${settlement.amount} from ${settlement.from}?`)) {
            alert("Payment marked as received! (In a real app, this would update the database)")
          }
        }
        li.appendChild(receivedBtn)
      }

      settlementList.appendChild(li)
    })
  }
}

function updateSettlementSummary(settlements) {
  let totalOwed = 0
  let totalOwes = 0

  settlements.forEach((settlement) => {
    const amount = Number.parseFloat(settlement.amount)

    if (settlement.from === currentUserName) {
      totalOwes += amount
    }

    if (settlement.to === currentUserName) {
      totalOwed += amount
    }
  })

  const balance = totalOwed - totalOwes

  document.getElementById("user-balance").textContent = `$${balance.toFixed(2)}`
  document.getElementById("user-balance").className = balance >= 0 ? "text-success" : "text-danger"

  document.getElementById("user-owes").textContent = `$${totalOwes.toFixed(2)}`
  document.getElementById("user-owed").textContent = `$${totalOwed.toFixed(2)}`
}

function filterSettlements() {
  const showOnlyMine = document.getElementById("show-only-my-settlements").checked

  if (showOnlyMine) {
    const mySettlements = allSettlements.filter(
      (settlement) => settlement.from === currentUserName || settlement.to === currentUserName,
    )
    displaySettlements(mySettlements)
  } else {
    displaySettlements(allSettlements)
  }
}

// Fetch budget status
async function fetchBudgetStatus() {
  if (!currentGroupId) return

  try {
    const response = await fetch(`${API_URL}/budget-status/${currentGroupId}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to fetch budget status")
    }

    const budgetStatus = await response.json()
    currentBudget = budgetStatus.budget

    // Update budget display
    const budgetDisplay = document.getElementById("budget-display")
    if (budgetDisplay) {
      if (budgetStatus.budget > 0) {
        budgetDisplay.innerHTML = `
          <div class="alert alert-info mb-3">
            <div class="d-flex justify-content-between mb-2">
              <strong>Group Budget:</strong> $${budgetStatus.budget.toFixed(2)}
              <span><strong>Remaining:</strong> $${budgetStatus.remaining.toFixed(2)}</span>
            </div>
            <div class="progress">
              <div class="progress-bar ${budgetStatus.percentage > 90 ? 'bg-danger' : 
                                        budgetStatus.percentage > 75 ? 'bg-warning' : 'bg-success'}" 
                   role="progressbar" style="width: ${budgetStatus.percentage}%;" 
                   aria-valuenow="${budgetStatus.percentage}" aria-valuemin="0" aria-valuemax="100">
                ${budgetStatus.percentage}%
              </div>
            </div>
          </div>
        `
      } else {
        budgetDisplay.innerHTML = `
          <div class="alert alert-secondary mb-3">
            No budget set for this group.
            ${isCreator ? '<button class="btn btn-sm btn-outline-primary ms-3" onclick="showBudgetModal()">Set Budget</button>' : ''}
          </div>
        `
      }
    }

    // Update budget input in modal
    if (isCreator) {
      document.getElementById("groupBudget").value = budgetStatus.budget
    }
  } catch (error) {
    console.error("Error fetching budget status:", error)
  }
}

// Show budget modal
function showBudgetModal() {
  const budgetModal = new bootstrap.Modal(document.getElementById('budgetModal'))
  budgetModal.show()
}

// Update group budget
async function updateBudget() {
  if (!currentGroupId || !isCreator) return

  const budget = document.getElementById("groupBudget").value

  if (budget === "" || isNaN(Number(budget))) {
    alert("Please enter a valid budget amount.")
    return
  }

  try {
    const response = await fetch(`${API_URL}/update-budget/${currentGroupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget: Number(budget),
        creator_name: creatorName,
      }),
    })

    const result = await response.json()

    if (response.ok) {
      alert(result.message || "Budget updated successfully!")
      fetchBudgetStatus()
      
      // Close the modal
      const budgetModal = bootstrap.Modal.getInstance(document.getElementById('budgetModal'))
      budgetModal.hide()
    } else {
      alert(result.error || "Failed to update budget")
    }
  } catch (error) {
    alert("Error connecting to server. Please try again.")
    console.error(error)
  }
}

// Export expenses as CSV
function exportCSV() {
  if (!currentGroupId) return
  
  window.open(`${API_URL}/export/csv/${currentGroupId}`, '_blank')
}

// Export expenses as PDF
function exportPDF() {
  if (!currentGroupId) return
  
  // Create a printable version of the expenses
  const printWindow = window.open('', '_blank')
  
  // Get group name and current date
  const groupName = currentGroupName
  const currentDate = new Date().toLocaleDateString()
  
  // Start building HTML content
  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Expenses Report - ${groupName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1, h2 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        @media print {
          .no-print { display: none; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>Expense Report</h1>
      <h2>${groupName}</h2>
      <p><strong>Generated:</strong> ${currentDate}</p>
      <p><strong>Generated by:</strong> ${currentUserName}</p>
      
      <div class="no-print" style="text-align: center; margin: 20px;">
        <button onclick="window.print()">Print Report</button>
      </div>
  `
  
  // Add expenses table
  htmlContent += `
    <h3>Expenses</h3>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
          <th>Paid By</th>
          <th>Split Among</th>
          <th>Split Type</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
  `
  
  // Get expenses from the table
  const expenseRows = document.querySelectorAll('#expense-list tr')
  expenseRows.forEach(row => {
    const cells = row.querySelectorAll('td')
    if (cells.length >= 6) {
      htmlContent += `
        <tr>
          <td>${cells[0].textContent}</td>
          <td>${cells[1].textContent}</td>
          <td>${cells[2].textContent}</td>
          <td>${cells[3].textContent}</td>
          <td>${cells[4].textContent}</td>
          <td>${cells[5].textContent}</td>
        </tr>
      `
    }
  })
  
  htmlContent += `
      </tbody>
    </table>
  `
  
  // Add settlements table
  htmlContent += `
    <h3>Settlements</h3>
    <table>
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
  `
  
  // Add settlements
  allSettlements.forEach(settlement => {
    htmlContent += `
      <tr>
        <td>${settlement.from}</td>
        <td>${settlement.to}</td>
        <td>$${settlement.amount}</td>
      </tr>
    `
  })
  
  htmlContent += `
      </tbody>
    </table>
    
    <div class="footer">
      <p>Generated by SmartExpense - ${currentDate}</p>
    </div>
    </body>
    </html>
  `
  
  // Write to the new window and trigger print
  printWindow.document.open()
  printWindow.document.write(htmlContent)
  printWindow.document.close()
}

// Add session management functions
function saveSession() {
  const sessionData = {
    groupId: currentGroupId,
    groupName: currentGroupName,
    userName: currentUserName,
    isCreator: isCreator,
    creatorName: creatorName,
  }
  localStorage.setItem("smartExpenseSession", JSON.stringify(sessionData))
  checkForSavedSession()
}

function checkForSavedSession() {
  const savedSession = localStorage.getItem("smartExpenseSession")
  const resumeButton = document.getElementById("resume-session-btn")

  if (savedSession) {
    resumeButton.style.display = "inline-block"
  } else {
    resumeButton.style.display = "none"
  }
}

function resumeSession() {
  const savedSession = localStorage.getItem("smartExpenseSession")
  if (!savedSession) return

  const sessionData = JSON.parse(savedSession)
  currentGroupId = sessionData.groupId
  currentGroupName = sessionData.groupName
  currentUserName = sessionData.userName
  isCreator = sessionData.isCreator
  creatorName = sessionData.creatorName

  showGroupDashboard()
}

function clearSession() {
  localStorage.removeItem("smartExpenseSession")
  checkForSavedSession()
}

// Add a logout function
function logout() {
  clearSession()
  currentGroupId = null
  currentGroupName = ""
  currentUserName = ""
  isCreator = false
  creatorName = ""
  showInitialOptions()
}

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
  checkForSavedSession()
  showInitialOptions()
  
  // Add event listeners for split type changes
  document.getElementById("splitType").addEventListener("change", updateSplitTypeUI)
  
  // Add event listeners for split checkboxes
  document.addEventListener("change", function(e) {
    if (e.target.classList.contains("split-among-checkbox")) {
      updateCustomSplitUsers()
    }
  })
})
