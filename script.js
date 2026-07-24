/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelectionsBtn");
const generateRoutineButton = document.getElementById("generateRoutine");
const productModal = document.getElementById("productModal");
const modalTitle = document.getElementById("modalTitle");
const modalDescription = document.getElementById("modalDescription");
const closeModalBtn = document.getElementById("closeModalBtn");

// Cloudflare worker URL
const workerUrl = "https://wanderbot-worker.jdurazo636.workers.dev/";
const storageKey = "loreal-selected-products";

let allProducts = [];
let currentProducts = [];
let selectedProductIds = loadSelectedProductIds();
let isWaitingForReply = false;

// Keep the full chat history so follow-up questions can stay relevant.
let conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal beauty advisor. Answer only about skincare, haircare, makeup, fragrance, and routine-building topics. Use the conversation history and the user's selected products to give practical and beginner-friendly advice.",
  },
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

selectedProductsList.innerHTML = `
  <p class="empty-state">No products selected yet.</p>
`;

renderChatMessages();

function loadSelectedProductIds() {
  try {
    const savedProducts = localStorage.getItem(storageKey);

    if (!savedProducts) {
      return [];
    }

    const parsedProducts = JSON.parse(savedProducts);
    return Array.isArray(parsedProducts) ? parsedProducts : [];
  } catch (error) {
    return [];
  }
}

function saveSelectedProductIds() {
  localStorage.setItem(storageKey, JSON.stringify(selectedProductIds));
}

function updateSelectionControls() {
  if (clearSelectionsButton) {
    clearSelectionsButton.disabled = selectedProductIds.length === 0;
  }
}

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length === 0) {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
  }

  return allProducts;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderChatMessages() {
  const visibleMessages = conversationMessages.filter(
    (message) => message.role !== "system" && message.visible !== false,
  );

  if (visibleMessages.length === 0) {
    chatWindow.innerHTML = `
      <p class="empty-state">
        Select products and generate a routine to start chatting.
      </p>
    `;
    return;
  }

  chatWindow.innerHTML = visibleMessages
    .map(
      (message) => `
        <div class="chat-message ${message.role}">
          <strong>${message.role === "assistant" ? "Advisor" : "You"}</strong>
          <p>${escapeHtml(message.content)}</p>
        </div>
      `,
    )
    .join("");

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setChatBusy(isBusy) {
  userInput.disabled = isBusy;
  sendButton.disabled = isBusy;
  generateRoutineButton.disabled = isBusy;
}

function getSelectedProductData() {
  // Only send the selected products to the worker, using the fields the project asks for.
  return selectedProductIds
    .map((id) => allProducts.find((product) => product.id === id))
    .filter(Boolean)
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));
}

async function sendMessageToWorker(content, shouldShowInChat = true) {
  if (isWaitingForReply) {
    return;
  }

  isWaitingForReply = true;
  setChatBusy(true);

  conversationMessages.push({
    role: "user",
    content,
    visible: shouldShowInChat,
  });
  renderChatMessages();

  try {
    // Send the full conversation as a messages array to the worker.
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        max_tokens: 500,
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    const assistantReply =
      data.choices?.[0]?.message?.content ||
      "I couldn't generate a reply right now.";

    conversationMessages.push({ role: "assistant", content: assistantReply });
    renderChatMessages();
  } catch (error) {
    const fallbackReply =
      "I couldn't reach the advisor right now. Please try again.";

    conversationMessages.push({ role: "assistant", content: fallbackReply });
    renderChatMessages();
  } finally {
    isWaitingForReply = false;
    setChatBusy(false);
  }
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  currentProducts = products;

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.includes(product.id);

      return `
        <div
          class="product-card ${isSelected ? "is-selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
          aria-label="${product.name} by ${product.brand}. ${isSelected ? "Selected" : "Not selected"}."
        >
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
            <span class="selection-badge">${isSelected ? "Selected" : "Tap to select"}</span>
            <button class="details-btn" type="button" data-product-id="${product.id}">
              View details
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSelectedProducts() {
  if (selectedProductIds.length === 0) {
    selectedProductsList.innerHTML = `<p class="empty-state">No products selected yet.</p>`;
    updateSelectionControls();
    return;
  }

  const selectedProducts = selectedProductIds
    .map((id) => allProducts.find((product) => product.id === id))
    .filter(Boolean);

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product-pill">
          <span>${product.name}</span>
          <button class="remove-product-btn" data-product-id="${product.id}" type="button" aria-label="Remove ${product.name}">
            ×
          </button>
        </div>
      `,
    )
    .join("");

  updateSelectionControls();
}

function toggleProductSelection(productId) {
  if (selectedProductIds.includes(productId)) {
    selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  } else {
    selectedProductIds.push(productId);
  }

  saveSelectedProductIds();
  displayProducts(currentProducts);
  renderSelectedProducts();
}

function clearAllSelections() {
  selectedProductIds = [];
  saveSelectedProductIds();
  renderSelectedProducts();

  if (currentProducts.length > 0) {
    displayProducts(currentProducts);
  }
}

function openProductModal(productId) {
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  modalTitle.textContent = `${product.name} — ${product.brand}`;
  modalDescription.textContent = product.description;
  productModal.classList.remove("hidden");
}

function closeProductModal() {
  productModal.classList.add("hidden");
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
});

productsContainer.addEventListener("click", (e) => {
  const detailsButton = e.target.closest(".details-btn");

  if (detailsButton) {
    e.stopPropagation();
    const productId = Number(detailsButton.dataset.productId);
    openProductModal(productId);
    return;
  }

  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const productId = Number(productCard.dataset.productId);
  toggleProductSelection(productId);
});

productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") {
    return;
  }

  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  e.preventDefault();
  const productId = Number(productCard.dataset.productId);
  toggleProductSelection(productId);
});

closeModalBtn.addEventListener("click", closeProductModal);
productModal.addEventListener("click", (e) => {
  if (e.target === productModal) {
    closeProductModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeProductModal();
  }
});

selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-product-btn");

  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.productId);
  toggleProductSelection(productId);
});

clearSelectionsButton.addEventListener("click", clearAllSelections);

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = userInput.value.trim();

  if (!message) {
    return;
  }

  const hasAssistantReply = conversationMessages.some(
    (item) => item.role === "assistant",
  );

  if (!hasAssistantReply) {
    chatWindow.innerHTML = `
      <p class="empty-state">
        Generate a routine first, then ask follow-up questions.
      </p>
    `;
    return;
  }

  await sendMessageToWorker(message);
  chatForm.reset();
});

generateRoutineButton.addEventListener("click", async () => {
  if (selectedProductIds.length === 0) {
    chatWindow.innerHTML =
      '<p class="empty-state">Select at least one product before generating a routine.</p>';
    return;
  }

  const selectedProducts = getSelectedProductData();

  if (selectedProducts.length === 0) {
    chatWindow.innerHTML =
      '<p class="empty-state">Select at least one product before generating a routine.</p>';
    return;
  }

  const routinePrompt = `Create a personalized routine using these selected products. Keep it practical, beginner-friendly, and tailored to the user's goals. Use this JSON data: ${JSON.stringify(selectedProducts, null, 2)}`;

  await sendMessageToWorker(routinePrompt, false);
});

async function initializeApp() {
  await loadProducts();
  renderSelectedProducts();
}

initializeApp();
