const VR_NS = "vreader";

const ensureStyles = () => {
  if (document.getElementById("vreader-style")) return;
  const style = document.createElement("style");
  style.id = "vreader-style";
  style.textContent = `
    .vr-sentence{border-radius:12px;padding:0.08rem 0.12rem;margin:0 -0.06rem;transition:background-color 120ms ease;}
    .vr-sentence-active{background-color:rgb(172 245 98 / 0.24);}
    .vr-unit{border-radius:0.5rem;padding:0.05rem 0.18rem;margin:0 -0.04rem;transition:background-color 120ms ease, box-shadow 120ms ease;cursor:default;}
    .vr-unit-word{background-color:rgb(253 230 138 / var(--vr-hl-base-alpha, 0.26));box-shadow:inset 0 0 0 1px rgb(245 158 11 / 0.55);}
    .vr-unit-phrase{background-color:rgb(186 230 253 / var(--vr-hl-base-alpha, 0.26));box-shadow:inset 0 0 0 1px rgb(14 165 233 / 0.50);}
    .vr-unit-pattern{background-color:rgb(245 208 254 / var(--vr-hl-base-alpha, 0.26));box-shadow:inset 0 0 0 1px rgb(217 70 239 / 0.48);}
    .vr-unit-idiom{background-color:rgb(167 243 208 / var(--vr-hl-base-alpha, 0.26));box-shadow:inset 0 0 0 1px rgb(16 185 129 / 0.46);}
    .vr-sentence-active .vr-unit-word{background-color:rgb(253 230 138 / var(--vr-hl-active-alpha, 0.58));box-shadow:inset 0 0 0 1px rgb(217 119 6 / 0.72), 0 0 0 2px rgb(24 24 27 / 0.06);}
    .vr-sentence-active .vr-unit-phrase{background-color:rgb(186 230 253 / var(--vr-hl-active-alpha, 0.58));box-shadow:inset 0 0 0 1px rgb(2 132 199 / 0.66), 0 0 0 2px rgb(24 24 27 / 0.06);}
    .vr-sentence-active .vr-unit-pattern{background-color:rgb(245 208 254 / var(--vr-hl-active-alpha, 0.58));box-shadow:inset 0 0 0 1px rgb(192 38 211 / 0.62), 0 0 0 2px rgb(24 24 27 / 0.06);}
    .vr-sentence-active .vr-unit-idiom{background-color:rgb(167 243 208 / var(--vr-hl-active-alpha, 0.58));box-shadow:inset 0 0 0 1px rgb(5 150 105 / 0.60), 0 0 0 2px rgb(24 24 27 / 0.06);}
    .vr-translation{margin-top:0.5rem;border-left:2px solid rgb(228 228 231);padding-left:0.75rem;font-size:0.95rem;line-height:1.65;color:rgb(82 82 91);}
    .vr-badge{display:inline-flex;align-items:center;gap:0.4rem;font-size:12px;color:rgb(113 113 122);margin-top:0.75rem;}
    .vr-dot{width:0.5rem;height:0.5rem;border-radius:0.2rem;display:inline-block;}
    .vr-tooltip{position:fixed;z-index:999999;max-width:min(360px, calc(100vw - 24px));background:rgb(24 24 27 / 0.92);color:rgb(244 244 245);border:1px solid rgb(63 63 70 / 0.7);border-radius:12px;padding:10px 12px;box-shadow:0 10px 30px rgb(0 0 0 / 0.25);backdrop-filter:blur(10px);pointer-events:none;opacity:0;transform:translateY(2px);transition:opacity 80ms ease, transform 80ms ease;}
    .vr-tooltip[data-open="true"]{opacity:1;transform:translateY(0);}
    .vr-tooltip-row{display:flex;align-items:center;gap:0.5rem;line-height:1.2;}
    .vr-tooltip-type{font-size:12px;color:rgb(161 161 170);border:1px solid rgb(82 82 91 / 0.7);padding:2px 8px;border-radius:999px;white-space:nowrap;}
    .vr-tooltip-label{font-size:14px;font-weight:600;letter-spacing:0.1px;}
    .vr-tooltip-note{margin-top:6px;font-size:13px;color:rgb(212 212 216);line-height:1.35;word-break:break-word;}
  `;
  document.head.appendChild(style);
};

const createIdFactory = (prefix) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

const normalizeText = (text) => (text || "").replace(/\s+/g, " ").trim();

const splitSentences = (text) => {
  const t = normalizeText(text);
  if (!t) return [];
  const parts = t.match(/[^.!?。！？]+[.!?。！？]?/g);
  if (!parts) return [t];
  return parts.map((s) => s.trim()).filter(Boolean);
};

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const cssEscape = (value) => {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
};

const typeToUnitClass = (type) => {
  if (type === "word") return "vr-unit-word";
  if (type === "phrase") return "vr-unit-phrase";
  if (type === "pattern") return "vr-unit-pattern";
  if (type === "idiom") return "vr-unit-idiom";
  return "vr-unit-phrase";
};

const typeToLabelZh = (type) => {
  if (type === "word") return "单词";
  if (type === "phrase") return "词组/搭配";
  if (type === "pattern") return "句式";
  if (type === "idiom") return "俗语";
  return "词组/搭配";
};

const detectUnitsForSentence = ({ sid, sentenceText, unitId }) => {
  const lower = sentenceText.toLowerCase();
  const units = [];

  const pushRange = (type, surface, start, end, meta = {}) => {
    if (start < 0 || end <= start) return;
    units.push({
      unitId: unitId(),
      type,
      sid,
      surface,
      range: { start, end },
      meta,
    });
  };

  const findAll = (needle) => {
    const n = needle.toLowerCase();
    const res = [];
    let i = 0;
    while (i <= lower.length) {
      const idx = lower.indexOf(n, i);
      if (idx === -1) break;
      res.push(idx);
      i = idx + n.length;
    }
    return res;
  };

  const phraseList = [
    { vi: "trí tuệ nhân tạo", zh: "人工智能" },
    { vi: "Ngoài ra", zh: "此外" },
    { vi: "cơ hội việc làm", zh: "就业机会" },
    { vi: "hạ tầng kỹ thuật số", zh: "数字基础设施" },
  ];
  phraseList.forEach((p) => {
    findAll(p.vi).forEach((idx) => pushRange("phrase", sentenceText.slice(idx, idx + p.vi.length), idx, idx + p.vi.length, { glossZh: p.zh }));
  });

  const wordList = [
    { vi: "startup", zh: "初创公司" },
    { vi: "chính phủ", zh: "政府" },
  ];
  wordList.forEach((w) => {
    findAll(w.vi).forEach((idx) => pushRange("word", sentenceText.slice(idx, idx + w.vi.length), idx, idx + w.vi.length, { glossZh: w.zh }));
  });

  const k1 = lower.indexOf("không chỉ");
  const k2 = lower.indexOf("mà còn");
  if (k1 !== -1 && k2 !== -1 && k2 > k1) {
    const patternUnitId = unitId();
    units.push({
      unitId: patternUnitId,
      type: "pattern",
      sid,
      surface: "không chỉ... mà còn...",
      patternParts: [
        { surface: sentenceText.slice(k1, k1 + "không chỉ".length), range: { start: k1, end: k1 + "không chỉ".length } },
        { surface: sentenceText.slice(k2, k2 + "mà còn".length), range: { start: k2, end: k2 + "mà còn".length } },
      ],
      meta: { hintZh: "强调结构：不仅A，而且B" },
    });
  }

  return units;
};

const annotateSentenceHtml = ({ sid, rawText, units }) => {
  const picks = [];
  units.forEach((u) => {
    if (u.type === "pattern" && Array.isArray(u.patternParts)) {
      u.patternParts.forEach((part) => {
        picks.push({
          unitId: u.unitId,
          type: u.type,
          range: part.range,
          label: u.surface,
          note: u.meta?.hintZh || "",
        });
      });
      return;
    }
    picks.push({
      unitId: u.unitId,
      type: u.type,
      range: u.range,
      label: u.surface,
      note: u.meta?.glossZh || "",
    });
  });

  const sorted = picks
    .slice()
    .sort((a, b) => (b.range.start - a.range.start) || (b.range.end - a.range.end));

  const occupied = [];
  const merged = [];
  sorted.forEach((it) => {
    const start = it.range.start;
    const end = it.range.end;
    const overlaps = occupied.some((r) => !(end <= r.start || start >= r.end));
    if (overlaps) return;
    occupied.push({ start, end });
    merged.push(it);
  });

  const chunks = [];
  let s = rawText;
  merged.forEach((it) => {
    const start = it.range.start;
    const end = it.range.end;
    const before = s.slice(0, start);
    const hit = s.slice(start, end);
    const after = s.slice(end);

    chunks.push(after);
    const unitClass = typeToUnitClass(it.type);
    const unitTypeZh = typeToLabelZh(it.type);
    const attrs = [
      `class="vr-unit ${unitClass}"`,
      `data-unit-id="${escapeHtml(it.unitId)}"`,
      `data-unit-type="${escapeHtml(unitTypeZh)}"`,
      `data-unit-label="${escapeHtml(it.label)}"`,
      it.note ? `data-unit-note="${escapeHtml(it.note)}"` : "",
      `data-sid="${escapeHtml(sid)}"`,
    ].filter(Boolean).join(" ");
    chunks.push(`<span ${attrs}>${escapeHtml(hit)}</span>`);
    s = before;
  });
  chunks.push(s);
  return chunks.reverse().join("");
};

const mockBackendTranslateAndAnalyze = async ({ blocks }) => {
  const out = [];

  const zhByBlock = {
    "p1": [
      "2026年，越南的研究人员在人工智能领域取得了多项关键进展。",
      "这些项目不仅引起国内关注，也因其应用潜力而获得国际高度评价。",
    ],
    "p2": [
      "专家表示，这一发展将推动智能产业，加快生产效率提升，并为年轻人带来更多新的就业机会。",
    ],
    "p3": [
      "此外，政府也在考虑加大对数字基础设施的投入，以支持 AI 初创公司及长期研究项目。",
    ],
  };

  blocks.forEach((b) => {
    
    const analysisUnits = [];
    b.sentences.forEach((s) => {
      const unitId = createIdFactory(`${s.sid}-u`);
      analysisUnits.push(...detectUnitsForSentence({ sid: s.sid, sentenceText: s.text, unitId }));
    });
    out.push({
      blockId: b.blockId,
      translation: {
        sentences: (zhByBlock[b.blockId] || []).map((t, idx) => ({ sid: b.sentences[idx]?.sid || `${b.blockId}-s${idx + 1}`, text: t })),
      },
      analysis: { units: analysisUnits },
    });
  });

  return { blocks: out };
};

const extractArticleModel = () => {
  const article = document.querySelector("main article");
  if (!article) return null;
  const ps = Array.from(article.querySelectorAll("p.mb-4"));
  const idBlock = createIdFactory("p");

  const blocks = ps.map((p) => {
    const blockId = idBlock();
    p.dataset.vrBlockId = blockId;
    const text = normalizeText(p.textContent);
    const sentences = splitSentences(text).map((s, i) => ({ sid: `${blockId}-s${i + 1}`, text: s }));
    return { blockId, el: p, text, sentences };
  });

  return { article, blocks };
};

const renderBlockBilingual = ({ block, backendBlock }) => {
  if (!block?.el || !backendBlock) return;

  const bySidUnits = new Map();
  (backendBlock.analysis?.units || []).forEach((u) => {
    const list = bySidUnits.get(u.sid) || [];
    list.push(u);
    bySidUnits.set(u.sid, list);
  });

  const sentenceHtmls = block.sentences.map((s) => {
    const units = bySidUnits.get(s.sid) || [];
    const inner = annotateSentenceHtml({ sid: s.sid, rawText: s.text, units });
    return `<span class="vr-sentence sentence sentence-vi" data-sid="${escapeHtml(s.sid)}">${inner}</span>`;
  });
  block.el.innerHTML = sentenceHtmls.join(" ");

  const existing = block.el.parentElement?.querySelector(`.vr-translation[data-vr-translation-of="${cssEscape(block.blockId)}"]`);
  if (existing) existing.remove();

  const zhSentences = backendBlock.translation?.sentences || [];
  const zhMap = new Map(zhSentences.map((s) => [s.sid, s.text]));
  const zhHtml = block.sentences
    .map((s) => {
      const t = zhMap.get(s.sid) || "";
      return `<span class="vr-sentence sentence sentence-zh" data-sid="${escapeHtml(s.sid)}">${escapeHtml(t)}</span>`;
    })
    .join(" ");

  const tr = document.createElement("p");
  tr.className = "vr-translation";
  tr.dataset.vrTranslationOf = block.blockId;
  tr.innerHTML = zhHtml;
  block.el.insertAdjacentElement("afterend", tr);
};

const attachSentenceHoverLinking = () => {
  let raf = 0;
  let activeSid = null;
  const activeEls = [];

  const clear = () => {
    if (!activeSid) return;
    document.querySelectorAll(`.vr-sentence[data-sid="${cssEscape(activeSid)}"]`).forEach((el) => el.classList.remove("vr-sentence-active"));
    activeSid = null;
  };

  const setActive = (sid) => {
    if (activeSid === sid) return;
    clear();
    activeSid = sid;
    if (!activeSid) return;
    document.querySelectorAll(`.vr-sentence[data-sid="${cssEscape(activeSid)}"]`).forEach((el) => el.classList.add("vr-sentence-active"));
  };

  document.addEventListener("mousemove", (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const sent = e.target?.closest?.(".vr-sentence");
      if (!sent) {
        setActive(null);
        return;
      }
      setActive(sent.dataset.sid || null);
    });
  });

  document.addEventListener("mouseleave", () => setActive(null));
  window.addEventListener("blur", () => setActive(null));

  return () => {
    clear();
  };
};

const ensureDensity = () => {
  document.body.style.setProperty("--vr-hl-base-alpha", "0.26");
  document.body.style.setProperty("--vr-hl-active-alpha", "0.58");
};

const ensureTooltipEl = () => {
  const existing = document.getElementById("vr-tooltip");
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = "vr-tooltip";
  el.className = "vr-tooltip";
  el.dataset.open = "false";
  document.body.appendChild(el);
  return el;
};

const attachUnitTooltip = () => {
  const tooltip = ensureTooltipEl();
  let raf = 0;
  let activeUnit = null;
  let lastX = 0;
  let lastY = 0;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const render = (unitEl) => {
    const type = unitEl.dataset.unitType || "";
    const label = unitEl.dataset.unitLabel || "";
    const note = unitEl.dataset.unitNote || "";
    tooltip.innerHTML = `
      <div class="vr-tooltip-row">
        <span class="vr-tooltip-type">${escapeHtml(type)}</span>
        <span class="vr-tooltip-label">${escapeHtml(label)}</span>
      </div>
      ${note ? `<div class="vr-tooltip-note">${escapeHtml(note)}</div>` : ""}
    `;
  };

  const position = (x, y) => {
    const margin = 12;
    const offset = 14;
    const rect = tooltip.getBoundingClientRect();
    const left = clamp(x + offset, margin, window.innerWidth - rect.width - margin);
    const top = clamp(y + offset, margin, window.innerHeight - rect.height - margin);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const open = (unitEl) => {
    if (activeUnit === unitEl) return;
    activeUnit = unitEl;
    render(unitEl);
    tooltip.dataset.open = "true";
    position(lastX, lastY);
  };

  const close = () => {
    if (!activeUnit) return;
    activeUnit = null;
    tooltip.dataset.open = "false";
  };

  document.addEventListener("pointermove", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!activeUnit) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      position(lastX, lastY);
    });
  });

  document.addEventListener("pointerover", (e) => {
    const unit = e.target?.closest?.(".vr-unit");
    if (!unit) return;
    open(unit);
  });

  document.addEventListener("pointerout", (e) => {
    if (!activeUnit) return;
    const from = e.target?.closest?.(".vr-unit");
    const to = e.relatedTarget?.closest?.(".vr-unit");
    if (from && to && from === to) return;
    if (from && from === activeUnit && !to) close();
    if (!from && !to) close();
    if (from && from === activeUnit && to && to !== activeUnit) open(to);
  });

  window.addEventListener("blur", close);
  document.addEventListener("scroll", close, true);

  return () => {
    close();
  };
};

const main = async () => {
  if (window[VR_NS]) return;
  window[VR_NS] = { enabled: true };

  ensureStyles();
  ensureDensity();

  const model = extractArticleModel();
  if (!model) return;
  const requestBlocks = model.blocks.map((b) => ({ blockId: b.blockId, text: b.text, sentences: b.sentences }));
  console.log(`requestBlocks:`, requestBlocks);
  
  const backend = await mockBackendTranslateAndAnalyze({ blocks: requestBlocks });
  console.log(`responseBlocks:`, backend.blocks);
  console.log(`${JSON.stringify(backend, null, 2)}`);
  
  const backendByBlock = new Map((backend.blocks || []).map((b) => [b.blockId, b]));

  model.blocks.forEach((b) => {
    const bb = backendByBlock.get(b.blockId);
    renderBlockBilingual({ block: b, backendBlock: bb });
  });

  attachSentenceHoverLinking();
  attachUnitTooltip();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
