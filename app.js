(function () {
  const apiBase = window.RIOT_API_BASE || (
    location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.protocol === "file:" || !location.hostname
      ? "http://127.0.0.1:5066"
      : "https://api.riotmotoco.com"
  );

  const buildSelect = document.getElementById("buildSelect");
  const systemFilters = document.getElementById("systemFilters");
  const partsList = document.getElementById("partsList");
  const partsCount = document.getElementById("partsCount");
  const selectedParts = document.getElementById("selectedParts");
  const selectedCount = document.getElementById("selectedCount");
  const sidebarTotal = document.getElementById("sidebarTotal");
  const quoteForm = document.getElementById("quoteForm");
  const quoteStatus = document.getElementById("quoteStatus");
  const quoteConfigSection = document.getElementById("quoteConfigSection");
  const quoteSuccessSection = document.getElementById("quoteSuccessSection");
  const quoteZipInput = quoteForm ? quoteForm.querySelector('input[name="shipping_zip"]') : null;

  if (!buildSelect || !partsList || !quoteForm) {
    return;
  }

  const state = {
    parts: [],
    systems: new Set(),
    activeSystem: "all",
    selected: new Map(), // itemID -> { part, tier }
    pricing: null,
    pricingPending: false,
    pricingError: "",
    pricingRequestID: 0,
  };

  const buildNames = {
    PK80: "Riot PK Open 80",
    UTILITY79: "Riot 79 Utility",
    WIDOW212: "Riot Cub 125",
    MOPED70: "Riot Moped",
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
    const matches = priceStr.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) return 0;
    const numbers = matches.map(parseFloat);
    const sum = numbers.reduce((a, b) => a + b, 0);
    return sum / numbers.length;
  }

  function parsePriceRange(priceStr) {
    if (!priceStr) return { min: 0, max: 0 };
    const matches = priceStr.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) return { min: 0, max: 0 };
    const numbers = matches.map(parseFloat);
    if (numbers.length === 1) {
      return { min: numbers[0], max: numbers[0] };
    }
    return { min: Math.min(...numbers), max: Math.max(...numbers) };
  }

  function tierDisplayName(tier) {
    return {
      cheap: "Bare Bones",
      mid: "Street",
      premium: "Riot",
    }[tier] || "Riot";
  }

  function normalizeZip(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 5);
  }

  function getSelectedItemsPayload() {
    return Array.from(state.selected.entries()).map(([id, entry]) => `${id}:${entry.tier}`);
  }

  async function refreshPricing() {
    const selectedItems = getSelectedItemsPayload();
    const shippingZip = normalizeZip(quoteZipInput ? quoteZipInput.value : "");

    if (!selectedItems.length) {
      state.pricing = null;
      state.pricingPending = false;
      state.pricingError = "";
      renderParts();
      renderSelected();
      return;
    }

    if (shippingZip.length !== 5) {
      state.pricing = null;
      state.pricingPending = false;
      state.pricingError = "Enter a 5-digit delivery ZIP to price freight.";
      renderParts();
      renderSelected();
      return;
    }

    const requestID = ++state.pricingRequestID;
    state.pricingPending = true;
    state.pricingError = "";
    renderParts();
    renderSelected();

    try {
      const pricing = await fetchJSON("/api/public/quote-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          build: buildSelect.value,
          shipping_zip: shippingZip,
          selected_items: selectedItems,
        }),
      });
      if (requestID !== state.pricingRequestID) {
        return;
      }
      state.pricing = pricing;
      state.pricingPending = false;
      state.pricingError = "";
      renderParts();
      renderSelected();
    } catch (error) {
      if (requestID !== state.pricingRequestID) {
        return;
      }
      state.pricing = null;
      state.pricingPending = false;
      state.pricingError = error.message || "Freight pricing unavailable.";
      renderParts();
      renderSelected();
    }
  }

  function getOptionLabel(part, ref) {
    if (part.item_id === "ALL-001") {
      return {
        cheap: "PK80 Tank Frame Package",
        mid: "PK80 3.4L Tank Frame Package",
        premium: "Build-Matched Chassis Package"
      }[ref.quality_tier] || (ref.public_sku || `RMC-${part.item_id}-${ref.quality_tier}`);
    }
    
    const sku = ref.public_sku || `RMC-${part.item_id}-${ref.quality_tier}`;
    if (ref.proven_specs) {
      const cleanSpecs = ref.proven_specs.replace(/^[\s,;.-]+|[\s,;.-]+$/g, "");
      const firstClause = cleanSpecs.split(/[;.]/)[0].trim();
      if (firstClause.length > 0 && firstClause.length < 75) {
        return `${sku} — ${firstClause}`;
      }
    }
    return sku;
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
      cheapLabel = "Build-Specific Frame";
      cheapDesc = "Frame fitment is selected by build lane, not by visual similarity.";
      midLabel = "Verified Frame Package";
      midDesc = "Frame, dropout, wheel, mount, and drive-path compatibility must be locked together.";
      premiumLabel = "Riot Frame Package";
      premiumDesc = "Highest-spec frame path only after PK80, 79cc jackshaft, or 212cc torque-converter fitment is verified.";
    } else if (name.includes("carburetor") || name.includes("carb")) {
      cheapLabel = "Generic Stock Carb";
      cheapDesc = "Unadjusted factory carburetor (prone to air leaks and rough idle).";
      midLabel = "Speed Carburetor";
      midDesc = "Improved stock carb with manually adjusted throttle gate.";
      premiumLabel = "Jetted BoFeng / Dellorto Clone";
      premiumDesc = "Precision-jetted BoFeng or Dellorto clone with high-flow velocity intake.";
    }

    return [
      { tier: "cheap", label: cheapLabel, desc: cheapDesc, badge: tierDisplayName("cheap") },
      { tier: "mid", label: midLabel, desc: midDesc, badge: tierDisplayName("mid") },
      { tier: "premium", label: premiumLabel, desc: premiumDesc, badge: tierDisplayName("premium") }
    ];
  }

  async function loadParts() {
    const build = buildSelect.value;
    const params = new URLSearchParams({ limit: "500" });

    partsList.innerHTML = "<p class=\"muted-text\">Loading components list...</p>";
    partsCount.textContent = "Loading...";

    try {
      const shared = build === "MOPED70"
        ? []
        : await fetchJSON(`/api/public/parts?build=ALL&${params.toString()}`);
      const buildParts = await fetchJSON(`/api/public/parts?build=${encodeURIComponent(build)}&${params.toString()}`);
      state.parts = [...shared, ...buildParts];
      state.systems = new Set(state.parts.map((part) => part.system).filter(Boolean));
      
      // Auto-select required parts as selected default tier
      const defaultTier = document.getElementById("tierSelectDefault")?.value || "premium";
      state.parts.forEach((part) => {
        const isRequired = part.required && part.required.toLowerCase() === "yes";
        if (isRequired && !state.selected.has(part.item_id)) {
          state.selected.set(part.item_id, { part, tier: defaultTier });
        }
      });

      renderFilters();
      renderParts();
      renderSelected();
      refreshPricing();
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
            cheap: "Bare Bones",
            mid: "Street",
            premium: "Riot"
          }[ref.quality_tier] || "Riot";
          
          return {
            tier: ref.quality_tier,
            label: getOptionLabel(part, ref),
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
      let activeTierDetails = tiers.find(t => t.tier === selectedTier);

      // Smart database fallback for components (like spark plugs and frames) missing the chosen tier
      if (!activeTierDetails && selectedTier !== "none" && tiers.length > 0) {
        activeTierDetails = tiers.find(t => t.tier === "premium") || 
                            tiers.find(t => t.tier === "mid") || 
                            tiers.find(t => t.tier === "cheap") || 
                            tiers[0];
        
        // Sync selected tier in memory to match the fallback
        if (selection && activeTierDetails) {
          selection.tier = activeTierDetails.tier;
        }
      }

      // Render Dropdown options
      const optionsHtml = tiers.map((t) => {
        const isOptActive = selectedTier === t.tier;
        const stockText = t.inventory > 0 ? `In Stock` : "Out of Stock";
        const optionPrefix = part.item_id === "ALL-001" ? "" : `${t.badge}: `;
        return `
          <option value="${escapeHTML(t.tier)}" ${isOptActive ? "selected" : ""}>
            ${escapeHTML(optionPrefix)}${escapeHTML(t.label)} — ${escapeHTML(t.price)} (${stockText})
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

    const formatPrice = (val) => val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (state.selected.size > 0) {
      let localSumMin = 0;
      let localSumMax = 0;
      state.selected.forEach((entry) => {
        const dbTiers = entry.part.cross_references || [];
        let priceStr = "";
        if (dbTiers.length > 0) {
          const ref = dbTiers.find(t => t.quality_tier === entry.tier);
          if (ref) {
            priceStr = ref.price_estimate;
          }
        }
        if (!priceStr) {
          const fallback = getTiersForPart(entry.part).find(t => t.tier === entry.tier);
          if (fallback) {
            priceStr = fallback.tier === "cheap" ? "$0.00" : (fallback.tier === "mid" ? "+$12.00" : "+$24.00");
          }
        }
        const range = parsePriceRange(priceStr);
        localSumMin += range.min;
        localSumMax += range.max;
      });

      const localSumText = localSumMin === localSumMax
        ? `$${formatPrice(localSumMin)}`
        : `$${formatPrice(localSumMin)} - $${formatPrice(localSumMax)}`;

      let pricingHtml = `
        <div class="picker-breakdown-row">
          <span>Configured Components Total:</span>
          <strong>${localSumText}</strong>
        </div>
        <div class="picker-total-row">
          <span>Total Quote Estimate:</span>
          <strong id="pickerTotalVal">Enter delivery ZIP to price freight.</strong>
        </div>
      `;

      if (state.pricingPending) {
        pricingHtml = `
          <div class="picker-total-row">
            <span>Total Quote Estimate:</span>
            <strong id="pickerTotalVal">Pricing freight...</strong>
          </div>
        `;
      } else if (state.pricing) {
        const pricingManualReview = Boolean(state.pricing.manual_review_required);
        const partsText = state.pricing.parts_min === state.pricing.parts_max
          ? `$${formatPrice(state.pricing.parts_min)}`
          : `$${formatPrice(state.pricing.parts_min)} - $${formatPrice(state.pricing.parts_max)}`;
        const totalText = pricingManualReview
          ? "Manual freight review required."
          : state.pricing.grand_min === state.pricing.grand_max
            ? `$${formatPrice(state.pricing.grand_min)}`
            : `$${formatPrice(state.pricing.grand_min)} - $${formatPrice(state.pricing.grand_max)}`;

        pricingHtml = `
          <div class="picker-breakdown-row">
            <span>Configured Components Total:</span>
            <strong>${partsText}</strong>
          </div>
          <div class="picker-breakdown-row">
            <span>Pro Assembly & Bench Testing:</span>
            <strong>$${formatPrice(state.pricing.assembly_fee)}</strong>
          </div>
          <div class="picker-breakdown-row">
            <span>UPS / FedEx Ground Shipping:</span>
            <strong>${pricingManualReview ? "Manual review required" : `$${formatPrice(state.pricing.freight_fee)}`}</strong>
          </div>
          ${pricingManualReview ? `<div class="picker-breakdown-row"><span>Freight Review:</span><strong>${escapeHTML(state.pricing.manual_review_note || "We will follow up with a verified shipping quote.")}</strong></div>` : ""}
          <div class="picker-total-row">
            <span>Total Quote Estimate:</span>
            <strong id="pickerTotalVal">${totalText}</strong>
          </div>
        `;
      } else if (state.pricingError) {
        pricingHtml = `
          <div class="picker-total-row">
            <span>Total Quote Estimate:</span>
            <strong id="pickerTotalVal">${escapeHTML(state.pricingError)}</strong>
          </div>
        `;
      }

      html += `
        <div class="picker-total-block">
          ${pricingHtml}
        </div>
      </div>`;
    } else {
      html += `
        <div class="picker-total-row">
          <span>Estimated System Parts Total:</span>
          <strong id="pickerTotalVal">$0.00</strong>
        </div>
      </div>`;
    }

    partsList.innerHTML = html;
  }

  function renderSelected() {
    const items = Array.from(state.selected.values());
    selectedCount.textContent = `${items.length} selected`;
    
    if (!items.length) {
      selectedParts.innerHTML = "<p class=\"muted-text\">Select components to start a build sheet.</p>";
      if (sidebarTotal) {
        sidebarTotal.innerHTML = "";
      }
      return;
    }

    selectedParts.innerHTML = items.map(({ part, tier }) => {
      const isFrame = part.item_id === "ALL-001";
      
      const badgeClass = isFrame ? "badge-premium" : ({
        cheap: "badge-cheap",
        mid: "badge-mid",
        premium: "badge-premium"
      }[tier] || "badge-premium");
      
      const label = isFrame ? ({
        cheap: "Frame Review",
        mid: "Frame Review",
        premium: "Frame Review"
      }[tier] || "Chassis") : ({
        cheap: "Bare Bones",
        mid: "Street",
        premium: "Riot"
      }[tier] || "Riot");

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

    const formatPrice = (val) => val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (sidebarTotal) {
      if (state.pricingPending) {
        sidebarTotal.innerHTML = `
          <div class="sidebar-total-card">
            <span class="total-label">Total Quote Estimate</span>
            <span class="total-amount">Pricing freight...</span>
          </div>
        `;
      } else if (state.pricing) {
        const pricingManualReview = Boolean(state.pricing.manual_review_required);
        const partsText = state.pricing.parts_min === state.pricing.parts_max
          ? `$${formatPrice(state.pricing.parts_min)}`
          : `$${formatPrice(state.pricing.parts_min)} - $${formatPrice(state.pricing.parts_max)}`;
        const totalText = pricingManualReview
          ? "Manual freight review required."
          : state.pricing.grand_min === state.pricing.grand_max
            ? `$${formatPrice(state.pricing.grand_min)}`
            : `$${formatPrice(state.pricing.grand_min)} - $${formatPrice(state.pricing.grand_max)}`;
        sidebarTotal.innerHTML = `
          <div class="sidebar-total-card">
            <div class="sidebar-total-breakdown">
              <div class="breakdown-row">
                <span>Configured Parts:</span>
                <span>${partsText}</span>
              </div>
              <div class="breakdown-row">
                <span>Pro Assembly:</span>
                <span>$${formatPrice(state.pricing.assembly_fee)}</span>
              </div>
              <div class="breakdown-row">
                <span>UPS / FedEx Ground Shipping:</span>
                <span>${pricingManualReview ? "Manual review required" : `$${formatPrice(state.pricing.freight_fee)}`}</span>
              </div>
              ${pricingManualReview ? `<div class="breakdown-row"><span>Freight Review:</span><span>${escapeHTML(state.pricing.manual_review_note || "We will follow up with a verified shipping quote.")}</span></div>` : ""}
            </div>
            <div class="breakdown-divider"></div>
            <span class="total-label">Total Quote Estimate</span>
            <span class="total-amount">${totalText}</span>
          </div>
        `;
      } else {
        let localSumMin = 0;
        let localSumMax = 0;
        state.selected.forEach((entry) => {
          const dbTiers = entry.part.cross_references || [];
          let priceStr = "";
          if (dbTiers.length > 0) {
            const ref = dbTiers.find(t => t.quality_tier === entry.tier);
            if (ref) {
              priceStr = ref.price_estimate;
            }
          }
          if (!priceStr) {
            const fallback = getTiersForPart(entry.part).find(t => t.tier === entry.tier);
            if (fallback) {
              priceStr = fallback.tier === "cheap" ? "$0.00" : (fallback.tier === "mid" ? "+$12.00" : "+$24.00");
            }
          }
          const range = parsePriceRange(priceStr);
          localSumMin += range.min;
          localSumMax += range.max;
        });

        const localSumText = localSumMin === localSumMax
          ? `$${formatPrice(localSumMin)}`
          : `$${formatPrice(localSumMin)} - $${formatPrice(localSumMax)}`;

        // Upfront shipping & assembly estimates
        const estAssembly = 250.00;
        const estShipMin = 85.00;
        const estShipMax = 140.00;

        const estGrandMin = localSumMin + estAssembly + estShipMin;
        const estGrandMax = localSumMax + estAssembly + estShipMax;

        const estGrandText = estGrandMin === estGrandMax
          ? `$${formatPrice(estGrandMin)}`
          : `$${formatPrice(estGrandMin)} - $${formatPrice(estGrandMax)}`;

        sidebarTotal.innerHTML = `
          <div class="sidebar-total-card">
            <div class="sidebar-total-breakdown">
              <div class="breakdown-row">
                <span>Configured Parts:</span>
                <span>${localSumText}</span>
              </div>
              <div class="breakdown-row">
                <span>Pro Assembly:</span>
                <span>$${formatPrice(estAssembly)}</span>
              </div>
              <div class="breakdown-row">
                <span>UPS / FedEx Ground (Est.):</span>
                <span>$${formatPrice(estShipMin)} - $${formatPrice(estShipMax)}</span>
              </div>
            </div>
            <div class="breakdown-divider"></div>
            <span class="total-label">Total Quote Estimate</span>
            <span class="total-amount">${estGrandText}</span>
            <div style="font-size: 10px; color: #888888; margin-top: 8px; text-align: center; line-height: 1.3;">
              * Enter your Delivery ZIP code below to calculate your exact Ground shipping rate.
            </div>
          </div>
        `;
      }
    }
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
    refreshPricing();
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
    state.pricing = null;
    state.pricingError = "";
    renderSelected();
    loadParts();
  });

  const tierSelectDefault = document.getElementById("tierSelectDefault");
  if (tierSelectDefault) {
    tierSelectDefault.addEventListener("change", () => {
      const defaultTier = tierSelectDefault.value;
      state.pricing = null;
      state.pricingError = "";

      // Update all currently selected parts to use the new default tier
      state.selected.forEach((entry, key) => {
        state.selected.set(key, { part: entry.part, tier: defaultTier });
      });

      // Re-populate any required parts that weren't selected
      state.parts.forEach((part) => {
        const isRequired = part.required && part.required.toLowerCase() === "yes";
        if (isRequired && !state.selected.has(part.item_id)) {
          state.selected.set(part.item_id, { part, tier: defaultTier });
        }
      });

      renderParts();
      renderSelected();
      refreshPricing();
    });
  }

  if (quoteZipInput) {
    quoteZipInput.addEventListener("input", () => {
      quoteZipInput.value = normalizeZip(quoteZipInput.value);
      refreshPricing();
    });
  }

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    quoteStatus.textContent = "Sending quote sheet...";
    const form = new FormData(quoteForm);
    const selectedItems = getSelectedItemsPayload();
    const shippingZip = normalizeZip(form.get("shipping_zip"));

    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      build: buildSelect.value,
      shipping_zip: shippingZip,
      message: form.get("message"),
      selected_items: selectedItems,
    };

    try {
      const formatPrice = (val) => val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const successParts = Array.from(state.selected.values()).map(({ part, tier }) => {
        const tierLabel = { cheap: "Bare Bones", mid: "Street", premium: "Riot" }[tier] || "Riot";
        return `
          <div class="success-part-item">
            <span>${escapeHTML(part.part)}</span>
            <span class="success-part-tier">${escapeHTML(tierLabel)}</span>
          </div>
        `;
      }).join("");
 
      const result = await fetchJSON("/api/public/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const pricing = result.pricing || state.pricing;
      const pricingManualReview = Boolean(pricing && pricing.manual_review_required);
      const partsText = pricing && pricing.parts_min === pricing.parts_max
        ? `$${formatPrice(pricing.parts_min)}`
        : pricing
          ? `$${formatPrice(pricing.parts_min)} - $${formatPrice(pricing.parts_max)}`
          : "Unavailable";
      const totalText = pricingManualReview
        ? "Manual freight review required."
        : pricing && pricing.grand_min === pricing.grand_max
          ? `$${formatPrice(pricing.grand_min)}`
          : pricing
            ? `$${formatPrice(pricing.grand_min)} - $${formatPrice(pricing.grand_max)}`
            : "Unavailable";
 
      // Render the dedicated Success Landing Page view
      if (quoteSuccessSection) {
        quoteSuccessSection.innerHTML = `
          <div class="success-landing-card">
            <div class="success-header">
              <span class="success-icon">⚡</span>
              <h3>Quote Received!</h3>
            </div>
            
            <p class="success-intro">
              Hey <strong>${escapeHTML(payload.name)}</strong>, we've registered your custom build request! A copy of this quote sheet has been sent to <strong>${escapeHTML(payload.email)}</strong>.
            </p>
 
            <div class="success-total-card">
              <div class="sidebar-total-breakdown">
                <div class="breakdown-row">
                  <span>Configured Parts:</span>
                  <span>${partsText}</span>
                </div>
                <div class="breakdown-row">
                  <span>Pro Assembly:</span>
                  <span>${pricing ? `$${formatPrice(pricing.assembly_fee)}` : "Unavailable"}</span>
                </div>
                <div class="breakdown-row">
                  <span>UPS / FedEx Ground Shipping:</span>
                  <span>${pricing ? (pricingManualReview ? "Manual review required" : `$${formatPrice(pricing.freight_fee)}`) : "Unavailable"}</span>
                </div>
                ${pricingManualReview ? `<div class="breakdown-row"><span>Freight Review:</span><span>${escapeHTML(pricing.manual_review_note || "We will follow up with a verified shipping quote.")}</span></div>` : ""}
              </div>
              <div class="breakdown-divider"></div>
              <span class="total-label">Your Submitted Quote</span>
              <span class="total-amount">${totalText}</span>
            </div>

            <div class="success-manifest-box">
              <h4>Configured Components</h4>
              <div class="success-manifest-list">
                ${successParts}
              </div>
            </div>

            <button type="button" id="btnConfigureNew" class="button primary success-btn">Configure Another Build</button>
          </div>
        `;

        // Add action to the reset button
        document.getElementById("btnConfigureNew").addEventListener("click", () => {
          if (quoteSuccessSection && quoteConfigSection) {
            quoteSuccessSection.style.display = "none";
            quoteConfigSection.style.display = "block";
          }
        });
      }

      // Hide Configurator and Show Success View
      if (quoteConfigSection && quoteSuccessSection) {
        quoteConfigSection.style.display = "none";
        quoteSuccessSection.style.display = "block";
      }

      // Reset the form and selection back to default state
      quoteForm.reset();
      state.selected.clear();
      state.pricing = null;
      state.pricingError = "";
      renderSelected();
      
      // Re-populate required parts
      const defaultTier = document.getElementById("tierSelectDefault")?.value || "premium";
      state.parts.forEach((part) => {
        const isRequired = part.required && part.required.toLowerCase() === "yes";
        if (isRequired) {
          state.selected.set(part.item_id, { part, tier: defaultTier });
        }
      });
      renderSelected();
      renderParts();
    } catch (error) {
      const subject = encodeURIComponent(`Riot Moto Co. quote request - ${buildNames[buildSelect.value] || buildSelect.value}`);
      
      const partListText = Array.from(state.selected.values()).map(({ part, tier }) => {
        const tierName = { cheap: "Bare Bones", mid: "Street", premium: "Riot" }[tier];
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
        `Shipping ZIP: ${payload.shipping_zip || ""}`,
        "",
        payload.message || "",
      ].join("\n"));
      quoteStatus.innerHTML = `API unavailable. <a href="mailto:builds@riotmotoco.com?subject=${subject}&body=${body}">Send by email instead.</a>`;
    }
  });

  renderSelected();
  loadParts();
}());
