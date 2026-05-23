(function () {
  const apiBase = window.RIOT_API_BASE || (
    location.hostname === "127.0.0.1" || location.hostname === "localhost"
      ? "http://127.0.0.1:5066"
      : "https://api.riotmotoco.com"
  );

  const buildSelect = document.getElementById("buildSelect");
  const systemFilters = document.getElementById("systemFilters");
  const partsList = document.getElementById("partsList");
  const partsCount = document.getElementById("partsCount");
  const selectedParts = document.getElementById("selectedParts");
  const selectedCount = document.getElementById("selectedCount");
  const quoteForm = document.getElementById("quoteForm");
  const quoteStatus = document.getElementById("quoteStatus");

  if (!buildSelect || !partsList || !quoteForm) {
    return;
  }

  const state = {
    parts: [],
    systems: new Set(),
    activeSystem: "all",
    selected: new Map(), // itemID -> { part, tier }
  };

  const buildNames = {
    PK80: "Riot PK Open 80",
    UTILITY79: "Riot 79 Utility",
    WIDOW212: "Widowmaker 212",
  };

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function parsePriceValue(priceStr) {
    if (!priceStr) return 0;
    let clean = "";
    for (let c of priceStr) {
      if ((c >= "0" && c <= "9") || c === ".") {
        clean += c;
      }
    }
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  async function fetchJSON(path, options) {
    const response = await fetch(`${apiBase}${path}`, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  function getTiersForPart(part) {
    const name = (part.part || "").toLowerCase();
    const system = (part.system || "").toLowerCase();

    let cheapLabel = "Stock Kit / OEM";
    let cheapDesc = "Factory generic part included in base Chinese box kits.";
    let midLabel = "Standard Grade";
    let midDesc = "Decent aftermarket replacement, balanced for budget builds.";
    let premiumLabel = "Riot Premium Spec";
    let premiumDesc = part.quality_target || "High-tensile, name-brand industrial components.";

    if (system === "brakes") {
      cheapLabel = "Bicycle Caliper Brakes";
      cheapDesc = "Generic mechanical rim or low-end disc brakes (high stopping distance).";
      midLabel = "Mechanical Disc Upgrades";
      midDesc = "Cable-actuated disc system with generic pads.";
      premiumLabel = "Shimano BR-MT200 Hydraulic";
      premiumDesc = "Shimano mineral-oil dual-piston hydraulic disc system (maximum power).";
    } else if (system === "hardware" || name.includes("fastener") || name.includes("mount") || name.includes("bolt") || name.includes("screw")) {
      cheapLabel = "Stock Soft Hardware";
      cheapDesc = "Soft Grade 4.8 unrated pot-metal bolts (prone to stripping & stretching).";
      midLabel = "Grade 8.8 / Hardened Steel";
      midDesc = "Standard hardened steel fasteners with split-lock washers.";
      premiumLabel = "ISO Class 10.9/12.9 Upgrade";
      premiumDesc = "High-tensile alloy steel fasteners paired with Nord-Lock wedge-lock washers.";
    } else if (name.includes("chain")) {
      cheapLabel = "Generic Kit Chain";
      cheapDesc = "No-name standard-weight chain (high initial stretch & low tensile rating).";
      midLabel = "Heavy Duty Carbon Steel";
      midDesc = "Standard heavy-duty chain with solid rollers.";
      premiumLabel = "RK M415H / DID 420D Spec";
      premiumDesc = "Name-brand Japanese load-rated industrial chain with high-tensile link plates.";
    } else if (name.includes("bearing")) {
      cheapLabel = "Unbranded Cartridge Bearings";
      cheapDesc = "Cheap no-name grease-filled bearings (prone to early play and water ingress).";
      midLabel = "Double-Shielded Standard";
      midDesc = "Sealed industrial bearings with standard grease fills.";
      premiumLabel = "NSK / SKF / Koyo Sealed";
      premiumDesc = "Premium name-brand Japanese/Swedish sealed bearings with high load ratings.";
    } else if (name.includes("spark plug") || name.includes("plug")) {
      cheapLabel = "Generic Chinese Spark Plug";
      cheapDesc = "Factory unbranded plug (unpredictable spark gap and insulation failures).";
      midLabel = "Torch / OEM Replacement";
      midDesc = "Standard budget spark plug.";
      premiumLabel = "NGK Premium Ignition";
      premiumDesc = "NGK-branded copper or iridium core plug (consistent ignition & heat range).";
    } else if (system === "fuel" || name.includes("fuel line")) {
      cheapLabel = "Clear Plastic Hose";
      cheapDesc = "Cheap transparent kit hose (turns brittle and cracks when exposed to ethanol).";
      midLabel = "Reinforced Rubber Line";
      midDesc = "Standard black automotive fuel hose.";
      premiumLabel = "Tygon / Gates Fuel Line";
      premiumDesc = "High-grade ethanol-resistant Tygon or Gates line with premium inline filter.";
    } else if (name.includes("clutch") || name.includes("torque converter")) {
      cheapLabel = "Stock Friction Clutch";
      cheapDesc = "Cheap kit-standard dry clutch with soft springs (prone to slip and heat fade).";
      midLabel = "Max-Torque Centrifugal";
      midDesc = "Reliable standard-duty centrifugal clutch.";
      premiumLabel = "Hilliard Extreme / TAV 30 Spec";
      premiumDesc = "Genuine Hilliard Extreme Duty clutch or GoPowerSports 30-Series Torque Converter.";
    } else if (name.includes("frame")) {
      cheapLabel = "Standard Cruiser Frame";
      cheapDesc = "Stock bicycle frame (slotted dropouts, needs clamp-on adapter brackets).";
      midLabel = "Upgraded Steel Cruiser";
      midDesc = "Heavy-duty steel frame with disc mounts.";
      premiumLabel = "CDH Motor-Ready Tank Frame";
      premiumDesc = "2.4L/3.4L integrated-tank heavy cruiser frame designed for motor installations.";
    } else if (name.includes("carburetor") || name.includes("carb")) {
      cheapLabel = "Generic Stock Carb";
      cheapDesc = "Unadjusted factory carburetor (prone to air leaks and rough idle).";
      midLabel = "Speed Carburetor";
      midDesc = "Improved stock carb with manually adjusted throttle gate.";
      premiumLabel = "Jetted BoFeng / Dellorto Clone";
      premiumDesc = "Precision-jetted BoFeng or Dellorto clone with high-flow velocity intake.";
    }

    return [
      { tier: "cheap", label: cheapLabel, desc: cheapDesc, badge: "Cheap OEM" },
      { tier: "mid", label: midLabel, desc: midDesc, badge: "Mid-Range" },
      { tier: "premium", label: premiumLabel, desc: premiumDesc, badge: "Riot Spec" }
    ];
  }

  async function loadParts() {
    const build = buildSelect.value;
    const params = new URLSearchParams({ limit: "500" });

    partsList.innerHTML = "<p class=\"muted-text\">Loading components list...</p>";
    partsCount.textContent = "Loading...";

    try {
      const shared = await fetchJSON(`/api/public/parts?build=ALL&${params.toString()}`);
      const buildParts = await fetchJSON(`/api/public/parts?build=${encodeURIComponent(build)}&${params.toString()}`);
      state.parts = [...shared, ...buildParts];
      state.systems = new Set(state.parts.map((part) => part.system).filter(Boolean));
      
      // Auto-select required parts as Premium by default
      state.parts.forEach((part) => {
        const isRequired = part.required && part.required.toLowerCase() === "yes";
        if (isRequired && !state.selected.has(part.item_id)) {
          state.selected.set(part.item_id, { part, tier: "premium" });
        }
      });

      renderFilters();
      renderParts();
      renderSelected();
    } catch (error) {
      partsCount.textContent = "API offline";
      partsList.innerHTML = `
        <div class="offline-box">
          <h3>Quote builder API is not reachable from this browser.</h3>
          <p>The catalog sidecar is available locally at <code>127.0.0.1:5066</code>. Public launch needs an exposed API endpoint before customers can submit live quote sheets.</p>
          <a class="button ghost" href="mailto:builds@riotmotoco.com?subject=Riot%20Moto%20Co.%20Quote%20Request">Email the build request</a>
        </div>
      `;
    }
  }

  function renderFilters() {
    const systems = ["all", ...Array.from(state.systems).sort()];
    systemFilters.innerHTML = systems.map((system) => `
      <button type="button" class="filter-chip${state.activeSystem === system ? " active" : ""}" data-system="${escapeHTML(system)}">
        ${escapeHTML(system === "all" ? "All systems" : system)}
      </button>
    `).join("");
  }

  function renderParts() {
    const filtered = state.parts.filter((part) => state.activeSystem === "all" || part.system === state.activeSystem);
    partsCount.textContent = `${filtered.length} components`;

    if (!filtered.length) {
      partsList.innerHTML = "<p class=\"muted-text\">No components found.</p>";
      return;
    }

    let html = `
      <div class="part-picker-table">
        <div class="picker-header-row">
          <div class="col-part">Component</div>
          <div class="col-selection">Selection & Sourcing Tier</div>
          <div class="col-price">Est. Cost</div>
        </div>
    `;

    html += filtered.map((part) => {
      const isRequired = part.required && part.required.toLowerCase() === "yes";
      const selection = state.selected.get(part.item_id);
      const selectedTier = selection ? selection.tier : "none";
      
      const dbTiers = part.cross_references || [];
      let tiers = [];
      
      if (dbTiers.length > 0) {
        tiers = dbTiers.map((ref) => {
          const badge = {
            cheap: "Cheap OEM",
            mid: "Mid-Range",
            premium: "Riot Spec"
          }[ref.quality_tier] || "Riot Spec";
          
          return {
            tier: ref.quality_tier,
            label: `${ref.brand} (${ref.sku})`,
            desc: ref.proven_specs,
            badge: badge,
            price: ref.price_estimate,
            inventory: ref.inventory_count || 0
          };
        });
      } else {
        const fallbackTiers = getTiersForPart(part);
        tiers = fallbackTiers.map((t) => ({
          ...t,
          price: t.tier === "cheap" ? "$0.00" : (t.tier === "mid" ? "+$12.00" : "+$24.00"),
          inventory: 0
        }));
      }

      // Find details of the currently selected tier
      const activeTierDetails = tiers.find(t => t.tier === selectedTier);

      // Render Dropdown options
      const optionsHtml = tiers.map((t) => {
        const isOptActive = selectedTier === t.tier;
        const stockText = t.inventory > 0 ? `In Stock` : "Out of Stock";
        return `
          <option value="${escapeHTML(t.tier)}" ${isOptActive ? "selected" : ""}>
            ${escapeHTML(t.badge)}: ${escapeHTML(t.label)} — ${escapeHTML(t.price)} (${stockText})
          </option>
        `;
      }).join("");

      const excludeOption = !isRequired ? `
        <option value="none" ${selectedTier === "none" ? "selected" : ""}>
          ❌ Exclude / Do Not Include
        </option>
      ` : "";

      const requiredPill = isRequired 
        ? "<span class=\"required-pill\">Required</span>" 
        : "<span class=\"optional-pill\">Optional</span>";

      // Populate descriptions, stock, and price details dynamically
      let specsText = "Do not include this component in the build sheet.";
      let stockBadgeHtml = `<span class="stock-badge out-of-stock">Excluded</span>`;
      let priceText = "$0.00";

      if (activeTierDetails) {
        specsText = activeTierDetails.desc;
        const stockStatus = activeTierDetails.inventory > 0 
          ? `🟢 In Stock (${activeTierDetails.inventory} ready at workshop)` 
          : "🟡 Out of Stock (Procurement Link Ready)";
        const stockClass = activeTierDetails.inventory > 0 ? "in-stock" : "out-of-stock";
        stockBadgeHtml = `<span class="stock-badge ${stockClass}">${escapeHTML(stockStatus)}</span>`;
        priceText = activeTierDetails.price;
      }

      return `
        <div class="picker-row${selectedTier !== "none" ? " included" : " excluded"}" id="row-${escapeHTML(part.item_id)}">
          <!-- Component Category -->
          <div class="col-part">
            <div class="comp-title-row">
              <h4>${escapeHTML(part.part)}</h4>
              ${requiredPill}
            </div>
            <span class="comp-meta">ID: <code>${escapeHTML(part.item_id)}</code> | System: <span class="system-tag">${escapeHTML(part.system)}</span></span>
          </div>

          <!-- Selection Dropdown -->
          <div class="col-selection">
            <select class="tier-select" data-item="${escapeHTML(part.item_id)}">
              ${optionsHtml}
              ${excludeOption}
            </select>
            <div class="specs-box">
              <p class="specs-desc">${escapeHTML(specsText)}</p>
              ${stockBadgeHtml}
            </div>
          </div>

          <!-- Price Display -->
          <div class="col-price">
            <span class="price-val">${escapeHTML(priceText)}</span>
          </div>
        </div>
      `;
    }).join("");

    // Calculate total accumulative cost of selected parts
    let runningTotalSum = 0;
    state.selected.forEach((entry) => {
      const dbTiers = entry.part.cross_references || [];
      const activeTier = dbTiers.find(t => t.quality_tier === entry.tier);
      if (activeTier) {
        runningTotalSum += parsePriceValue(activeTier.price_estimate);
      } else {
        const fallbackTiers = getTiersForPart(entry.part);
        const fallbackTier = fallbackTiers.find(t => t.tier === entry.tier);
        if (fallbackTier) {
          const priceStr = fallbackTier.tier === "cheap" ? "$0.00" : (fallbackTier.tier === "mid" ? "+$12.00" : "+$24.00");
          runningTotalSum += parsePriceValue(priceStr);
        }
      }
    });

    html += `
      <div class="picker-total-row">
        <span>Estimated System Parts Total:</span>
        <strong id="pickerTotalVal">$${runningTotalSum.toFixed(2)}</strong>
      </div>
    </div>`;

    partsList.innerHTML = html;
  }

  function renderSelected() {
    const items = Array.from(state.selected.values());
    selectedCount.textContent = `${items.length} selected`;
    
    if (!items.length) {
      selectedParts.innerHTML = "<p class=\"muted-text\">Select components to start a build sheet.</p>";
      return;
    }

    selectedParts.innerHTML = items.map(({ part, tier }) => {
      const badgeClass = {
        cheap: "badge-cheap",
        mid: "badge-mid",
        premium: "badge-premium"
      }[tier] || "badge-premium";
      
      const label = {
        cheap: "Cheap OEM",
        mid: "Mid-Range",
        premium: "Riot Spec"
      }[tier] || "Riot Spec";

      return `
        <div class="selected-item">
          <div class="selected-meta">
            <span>${escapeHTML(part.item_id)}</span>
            <span class="selected-badge ${badgeClass}">${escapeHTML(label)}</span>
          </div>
          <strong>${escapeHTML(part.part)}</strong>
        </div>
      `;
    }).join("");
  }

  function selectPartTier(itemID, tier) {
    const part = state.parts.find((candidate) => candidate.item_id === itemID);
    if (!part) {
      return;
    }
    if (tier === "none") {
      state.selected.delete(itemID);
    } else {
      state.selected.set(itemID, { part, tier });
    }
    renderParts();
    renderSelected();
  }

  systemFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-system]");
    if (!button) {
      return;
    }
    state.activeSystem = button.dataset.system;
    renderFilters();
    renderParts();
  });

  // Listen to dropdown changes on the parts table
  partsList.addEventListener("change", (event) => {
    const select = event.target.closest(".tier-select");
    if (!select) {
      return;
    }
    const itemID = select.dataset.item;
    const tier = select.value;
    selectPartTier(itemID, tier);
  });

  buildSelect.addEventListener("change", () => {
    state.selected.clear();
    renderSelected();
    loadParts();
  });

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    quoteStatus.textContent = "Sending quote sheet...";
    const form = new FormData(quoteForm);
    
    const selectedItems = Array.from(state.selected.entries()).map(([id, entry]) => {
      return `${id}:${entry.tier}`;
    });

    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      build: buildSelect.value,
      message: form.get("message"),
      selected_items: selectedItems,
    };

    try {
      const result = await fetchJSON("/api/public/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      quoteStatus.textContent = `Quote sheet received. Request #${result.id}.`;
      quoteForm.reset();
      state.selected.clear();
      renderSelected();
      
      // Re-populate required parts
      state.parts.forEach((part) => {
        const isRequired = part.required && part.required.toLowerCase() === "yes";
        if (isRequired) {
          state.selected.set(part.item_id, { part, tier: "premium" });
        }
      });
      renderSelected();
      renderParts();
    } catch (error) {
      const subject = encodeURIComponent($"Riot Moto Co. quote request - ${buildNames[buildSelect.value] || buildSelect.value}");
      
      const partListText = Array.from(state.selected.values()).map(({ part, tier }) => {
        const tierName = { cheap: "Cheap OEM", mid: "Mid-Range", premium: "Riot Spec" }[tier];
        return `- ${part.part} (${part.item_id}) -> Tier: ${tierName}`;
      }).join("\n");

      const body = encodeURIComponent([
        `Build: ${buildNames[buildSelect.value] || buildSelect.value}`,
        `Selected parts with selected Tiers:`,
        partListText,
        "",
        `Name: ${payload.name || ""}`,
        `Email: ${payload.email || ""}`,
        `Phone: ${payload.phone || ""}`,
        "",
        payload.message || "",
      ].join("\n"));
      quoteStatus.innerHTML = `API unavailable. <a href="mailto:builds@riotmotoco.com?subject=${subject}&body=${body}">Send by email instead.</a>`;
    }
  });

  renderSelected();
  loadParts();
}());
