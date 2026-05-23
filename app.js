(function () {
  const apiBase = window.RIOT_API_BASE || (
    location.hostname === "127.0.0.1" || location.hostname === "localhost"
      ? "http://127.0.0.1:5066"
      : "https://api.riotmotoco.com"
  );

  const buildSelect = document.getElementById("buildSelect");
  const partSearch = document.getElementById("partSearch");
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
    const query = partSearch.value.trim();
    const params = new URLSearchParams({ limit: "500" });
    if (query) {
      params.set("q", query);
    }

    partsList.innerHTML = "<p class=\"muted-text\">Loading parts...</p>";
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
    partsCount.textContent = `${filtered.length} parts`;

    if (!filtered.length) {
      partsList.innerHTML = "<p class=\"muted-text\">No matching parts found.</p>";
      return;
    }

    partsList.innerHTML = filtered.map((part) => {
      const isRequired = part.required && part.required.toLowerCase() === "yes";
      const selection = state.selected.get(part.item_id);
      const selectedTier = selection ? selection.tier : null;
      
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
            url: ref.source_url
          };
        });
      } else {
        const fallbackTiers = getTiersForPart(part);
        tiers = fallbackTiers.map((t) => ({
          ...t,
          price: t.tier === "cheap" ? "$0.00" : (t.tier === "mid" ? "+$12.00" : "+$24.00"),
          url: ""
        }));
      }
      
      const tierButtons = tiers.map((t) => {
        const isActive = selectedTier === t.tier;
        const priceTag = t.price ? `<span class="tier-price">${escapeHTML(t.price)}</span>` : "";
        const sourceLink = t.url ? `<a href="${escapeHTML(t.url)}" target="_blank" class="tier-link" onclick="event.stopPropagation()">View Product ↗</a>` : "";
        
        return `
          <button type="button" 
                  class="tier-card ${t.tier}${isActive ? " active" : ""}" 
                  data-item="${escapeHTML(part.item_id)}" 
                  data-tier="${t.tier}">
            <div class="tier-card-header">
              <span class="tier-badge">${escapeHTML(t.badge)}</span>
              ${priceTag}
            </div>
            <strong class="tier-title">${escapeHTML(t.label)}</strong>
            <span class="tier-desc">${escapeHTML(t.desc)}</span>
            ${sourceLink}
          </button>
        `;
      }).join("");

      const excludeButton = !isRequired ? `
        <button type="button" 
                class="tier-card none${!selectedTier ? " active" : ""}" 
                data-item="${escapeHTML(part.item_id)}" 
                data-tier="none">
          <div class="tier-card-header">
            <span class="tier-badge">Exclude</span>
          </div>
          <strong class="tier-title">Not Included</strong>
          <span class="tier-desc">Do not include this component in the build sheet.</span>
        </button>
      ` : "";

      const requiredPill = isRequired 
        ? "<span class=\"required-pill\">Required base item</span>" 
        : "<span class=\"optional-pill\">Optional upgrade / accessory</span>";

      return `
        <article class="part-row${selectedTier ? " included" : " excluded"}" id="row-${escapeHTML(part.item_id)}">
          <div class="part-header">
            <div class="part-title-row">
              <h4>${escapeHTML(part.part)}</h4>
              ${requiredPill}
            </div>
            <dl class="part-meta">
              <div><dt>ID</dt><dd>${escapeHTML(part.item_id)}</dd></div>
              <div><dt>System</dt><dd>${escapeHTML(part.system)}</dd></div>
              ${part.notes ? `<div><dt>Note</dt><dd>${escapeHTML(part.notes)}</dd></div>` : ""}
            </dl>
          </div>
          <div class="tier-grid">
            ${tierButtons}
            ${excludeButton}
          </div>
        </article>
      `;
    }).join("");
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

  partsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-item]");
    if (!button) {
      return;
    }
    const itemID = button.dataset.item;
    const tier = button.dataset.tier;
    selectPartTier(itemID, tier);
  });

  buildSelect.addEventListener("change", () => {
    state.selected.clear();
    renderSelected();
    loadParts();
  });

  partSearch.addEventListener("input", () => {
    window.clearTimeout(partSearch.searchTimer);
    partSearch.searchTimer = window.setTimeout(loadParts, 180);
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
      const subject = encodeURIComponent(`Riot Moto Co. quote request - ${buildNames[buildSelect.value] || buildSelect.value}`);
      
      const partListText = Array.from(state.selected.values()).map(({ part, tier }) => {
        const tierName = { cheap: "Cheap Shit", mid: "Mid-Range", premium: "Riot Spec" }[tier];
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
