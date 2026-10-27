/* 리아 브리핑 — 바닐라 JS PWA. 데이터는 암호화된 data/briefings.enc.json 에서 받아 비밀번호로 풀어요(메모리에서만). */
(function () {
  "use strict";

  var DATA_URL = "data/briefings.enc.json";
  var AAD = "ria-briefing:v1";
  var REMEMBER_DAYS = 30;
  var WD = ["일", "월", "화", "수", "목", "금", "토"];
  var COLORS = ["#e8743b", "#3b6fe8", "#2bb6a3", "#9aa6bf"];
  var state = { data: null, enc: null, hashBound: false, offline: !navigator.onLine, newsReport: null, newsCat: "전체", rec: 0 };

  var ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  var NAV = [
    { path: "/", label: "오늘", icon: "home" },
    { path: "/news", label: "뉴스", icon: "news" },
    { path: "/portfolio", label: "포트폴리오", icon: "pie" },
    { path: "/archive", label: "기록", icon: "list" }
  ];

  /* ---------- 작은 도우미 ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v; // 코드 안의 고정 SVG에만 사용
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  var won = function (n) { return Math.round(n).toLocaleString("ko-KR") + "원"; };
  var pct = function (n) { return (n > 0 ? "+" : n < 0 ? "-" : "") + Math.abs(n).toFixed(2) + "%"; };
  function kdate(d) { // "2026-10-27" -> "10월 27일(화)" (요일은 날짜 문자열만으로 계산, 시간대 영향 없음)
    var p = d.split("-").map(Number);
    return p[1] + "월 " + p[2] + "일(" + WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ")";
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function tone(label) { return label === "호재" ? "pro" : label === "악재" ? "con" : "mid"; }

  /* ---------- 공통 조각 ---------- */
  function sources(list, title) {
    if (!list || !list.length) return null;
    return h("section", { class: "sec" },
      h("h2", null, title || "출처"),
      h("div", { class: "card" }, h("ul", { class: "src" }, list.map(function (s) {
        return h("li", null, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" },
          h("div", null, h("div", { class: "t", text: s.title }),
            h("div", { class: "s", text: [s.site, s.date].filter(Boolean).join(" · ") })),
          h("span", { class: "go", text: "↗", "aria-hidden": "true" })));
      }))));
  }
  function header(title, sub) {
    var d = state.data.meta.updatedAt;
    return h("header", { class: "top" },
      h("div", null, h("h1", { text: title }), sub ? h("div", { class: "sub", text: sub }) : null),
      h("div", { class: "top-r" },
        h("span", { class: "pill" + (state.offline ? " off" : ""), text: state.offline ? "오프라인 · 저장본" : "KST" }),
        h("button", { class: "lockbtn", type: "button", "aria-label": "잠그고 이 기기에서 로그아웃", onclick: lockNow },
          h("span", { html: ICONS.lock, style: "display:contents" }), "잠금")));
  }

  /* ---------- 화면: 브리핑 ---------- */
  function viewBriefing(id) {
    var list = state.data.briefings;
    var b = id ? list.filter(function (x) { return x.id === id; })[0] : list[0];
    if (!b) return viewEmpty("브리핑을 찾지 못했어요.");
    var p = state.data.portfolio;
    var root = h("div", null);
    if (id) root.appendChild(h("button", { class: "back", onclick: function () { go("/archive"); }, text: "‹ 기록으로" }));
    root.appendChild(header(id ? "브리핑" : "좋은 아침이에요, " + state.data.meta.owner, kdate(b.date) + " " + b.time + " (KST) 발송"));
    root.appendChild(h("section", { class: "hero" },
      h("div", { class: "eyebrow", text: b.kind + " · " + kdate(b.date) + " " + b.time }),
      h("h2", { text: b.headline }),
      h("p", { text: b.summary })));

    root.appendChild(h("section", { class: "sec" },
      h("h2", null, "종목별 호재와 악재"),
      h("div", { class: "grid two" }, b.stocks.map(function (s) {
        return h("article", { class: "card stock" }, h("h3", { text: s.name }),
          h("ul", { class: "tl" },
            s.pros.map(function (t) { return h("li", null, h("span", { class: "mk pro", text: "+" }), h("span", { text: t })); }),
            s.cons.map(function (t) { return h("li", null, h("span", { class: "mk con", text: "−" }), h("span", { text: t })); })));
      }))));

    root.appendChild(h("section", { class: "sec" },
      h("h2", null, "이번 주 일정", h("small", { text: "한국시간" })),
      h("div", { class: "card" }, h("ul", { class: "sched" }, b.schedule.map(function (e) {
        return h("li", null, h("div", { class: "when", text: e.when }),
          h("div", null, h("div", { class: "what", text: e.what }), h("div", { class: "why", text: e.why })));
      })))));

    root.appendChild(h("section", { class: "sec" },
      h("h2", null, "리아의 의견"),
      h("div", { class: "card" }, h("ol", { class: "ops" }, b.opinions.map(function (t, i) {
        return h("li", null, h("span", { class: "num", text: String(i + 1) }), h("span", { text: t }));
      })))));

    var rec = state.rec < b.recommendations.length ? state.rec : 0;
    var recBox = h("div", { class: "card rec" });
    function drawRec() {
      var r = b.recommendations[rec];
      recBox.textContent = "";
      recBox.appendChild(h("h3", { text: r.title }));
      recBox.appendChild(h("p", { class: "intro", text: r.intro }));
      if (r.table) recBox.appendChild(h("div", { class: "tbl-wrap" }, h("table", null,
        h("thead", null, h("tr", null, r.table.columns.map(function (c) { return h("th", { scope: "col", text: c }); }))),
        h("tbody", null, r.table.rows.map(function (row) {
          return h("tr", null, row.map(function (c) { return h("td", { text: c }); }));
        })))));
      if (r.points && r.points.length) recBox.appendChild(h("ul", { class: "dots" }, r.points.map(function (t) { return h("li", { text: t }); })));
    }
    var seg = h("div", { class: "seg", role: "tablist", "aria-label": "오늘의 추천" }, b.recommendations.map(function (r, i) {
      return h("button", { class: "chip", role: "tab", "aria-selected": String(i === rec), text: r.tab, onclick: function () {
        rec = i; state.rec = i;
        Array.prototype.forEach.call(seg.children, function (c, j) { c.setAttribute("aria-selected", String(j === i)); });
        drawRec();
      } });
    }));
    drawRec();
    root.appendChild(h("section", { class: "sec" }, h("h2", null, "오늘의 추천 " + b.recommendations.length + "가지"), seg, recBox,
      h("p", { class: "note", text: "모든 의견은 참고용이고, 최종 투자 결정은 대표님이 하세요." })));

    root.appendChild(sources(b.sources));
    return root;
  }

  /* ---------- 화면: 뉴스 ---------- */
  function viewNews() {
    var reps = state.data.newsReports;
    if (!reps.length) return viewEmpty("아직 뉴스 조사가 없어요.");
    var rep = state.newsReport && reps.filter(function (r) { return r.id === state.newsReport; })[0] || reps[0];
    var cats = ["전체"];
    rep.topics.forEach(function (t) { if (cats.indexOf(t.cat) < 0) cats.push(t.cat); });
    var list = h("div", { class: "news" });
    function draw() {
      list.textContent = "";
      rep.topics.filter(function (t) { return state.newsCat === "전체" || t.cat === state.newsCat; }).forEach(function (t) {
        list.appendChild(h("article", { class: "card" },
          h("div", { class: "hd" }, h("span", { class: "pill " + tone(t.label), text: t.label }), h("span", { class: "cat", text: t.cat })),
          h("h3", { text: t.title }), h("p", { text: t.detail }), h("div", { class: "meta", text: t.meta })));
      });
    }
    var seg = h("div", { class: "seg", role: "group", "aria-label": "종목·주제 필터" }, cats.map(function (c) {
      return h("button", { class: "chip", "aria-pressed": String(c === state.newsCat), text: c, onclick: function () {
        state.newsCat = c;
        Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", String(b.textContent === c)); });
        draw();
      } });
    }));
    draw();
    var root = h("div", null, header("뉴스 토픽", rep.title + " · " + kdate(rep.date) + " " + rep.time + " (KST)"));
    if (reps.length > 1) root.appendChild(h("div", { class: "seg" }, reps.map(function (r) {
      return h("button", { class: "chip", "aria-pressed": String(r.id === rep.id), text: kdate(r.date), onclick: function () { state.newsReport = r.id; render(); } });
    })));
    root.appendChild(seg); root.appendChild(list); root.appendChild(sources(rep.sources, "뉴스 출처"));
    return root;
  }

  /* ---------- 화면: 포트폴리오 ---------- */
  function donut(items) {
    var NS = "http://www.w3.org/2000/svg", r = 56, c = 2 * Math.PI * r, off = 0;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 160 160"); svg.setAttribute("class", "donut"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "종목 비중 도넛 차트");
    var total = items.reduce(function (s, i) { return s + i.weightPct; }, 0);
    items.forEach(function (it, i) {
      var len = c * it.weightPct / total, ci = document.createElementNS(NS, "circle");
      ci.setAttribute("cx", 80); ci.setAttribute("cy", 80); ci.setAttribute("r", r); ci.setAttribute("fill", "none");
      ci.setAttribute("stroke", COLORS[i % COLORS.length]); ci.setAttribute("stroke-width", 22);
      ci.setAttribute("stroke-dasharray", (len - 2) + " " + (c - len + 2)); ci.setAttribute("stroke-dashoffset", String(-off));
      ci.setAttribute("transform", "rotate(-90 80 80)"); svg.appendChild(ci); off += len;
    });
    return svg;
  }
  function viewPortfolio() {
    var p = state.data.portfolio, total = p.etfValue + p.cma, pnl = p.etfValue - p.etfCost, pnlPct = pnl / p.etfCost * 100;
    var root = h("div", null, header("포트폴리오", kdate(p.asOf) + " 기준 · " + p.source));
    root.appendChild(h("div", { class: "metrics" },
      h("div", { class: "metric big" }, h("div", { class: "l", text: "총자산" }), h("div", { class: "v", text: won(total) }),
        h("div", { class: "d", text: "ETF 평가 " + won(p.etfValue) + " + CMA " + won(p.cma) })),
      h("div", { class: "metric" }, h("div", { class: "l", text: "ETF 평가손익" }),
        h("div", { class: "v neg", text: (pnl < 0 ? "-" : "+") + won(Math.abs(pnl)) }), h("div", { class: "d", text: "매수 " + won(p.etfCost) + " 대비 " + pct(pnlPct) })),
      h("div", { class: "metric" }, h("div", { class: "l", text: "이달 매수일" }),
        h("div", { class: "v", text: kdate(p.nextBuyDate) }), h("div", { class: "d", text: p.nextBuyNote + " · 월 " + won(p.monthlyBudget) }))));

    var holds = p.holdings.slice().sort(function (a, b) { return b.weightPct - a.weightPct; });
    root.appendChild(h("section", { class: "sec" }, h("h2", null, "비중"),
      h("div", { class: "card donut-wrap" }, donut(holds),
        h("ul", { class: "legend" }, holds.map(function (x, i) {
          return h("li", null, h("i", { style: "background:" + COLORS[i % COLORS.length] }), x.name, h("span", { text: x.weightPct.toFixed(1) + "%" }));
        })))));

    root.appendChild(h("section", { class: "sec" }, h("h2", null, "종목별 현황", h("small", { text: "월 적립 수량 기준 적립식" })),
      h("div", { class: "hold grid two" }, holds.map(function (x) {
        return h("article", { class: "card" },
          h("div", { class: "row1" }, h("div", null, h("h3", { text: x.name }), h("div", { class: "code", text: x.code + " · " + x.role })),
            h("div", { class: "ret " + (x.returnPct < 0 ? "neg" : ""), text: pct(x.returnPct) })),
          h("div", { class: "bar", "aria-hidden": "true" }, h("i", { style: "width:" + Math.min(100, x.weightPct) + "%" })),
          h("div", { class: "kv" },
            h("div", null, "보유", h("b", { text: x.qty + "주" })),
            h("div", null, "평균단가", h("b", { text: won(x.avg) })),
            h("div", null, "월 적립", h("b", { text: x.monthly + "주" }))));
      }))));

    root.appendChild(h("section", { class: "sec" }, h("h2", null, "리아의 점검"),
      h("div", { class: "card" }, h("ul", { class: "dots" }, p.notes.map(function (t) { return h("li", { text: t }); })))));
    return root;
  }

  /* ---------- 화면: 기록 ---------- */
  function viewArchive() {
    var a = state.data.archive.slice().sort(function (x, y) { return (y.date + y.time).localeCompare(x.date + x.time); });
    var root = h("div", null, header("기록", "날짜별 보고 모음 · 모든 시각은 KST"));
    root.appendChild(h("div", { class: "card" }, h("ul", { class: "arch" }, a.map(function (e) {
      var r = e.ref || {}, target = r.type === "briefing" ? "/briefing/" + r.id : r.type === "news" ? "/news" : r.type === "portfolio" ? "/portfolio" : null;
      return h("li", null, h("button", { disabled: !target, onclick: function () { if (target) { if (r.type === "news") state.newsReport = r.id; go(target); } } },
        h("span", { class: "k", text: e.kind }), h("span", { class: "dt", text: kdate(e.date) + " " + e.time }), h("span", { class: "sm", text: e.summary })));
    }))));
    root.appendChild(h("section", { class: "sec" }, h("h2", null, "자동 보고 루틴"),
      h("div", { class: "grid two" }, state.data.routines.map(function (r) {
        return h("article", { class: "card" }, h("h3", { text: r.name, style: "font-size:15px;font-weight:800" }),
          h("p", { text: r.when, style: "font-size:13.5px;color:var(--accent);font-weight:700;margin:4px 0" }),
          h("p", { text: r.what, style: "font-size:14px;color:var(--ink2)" }));
      })),
      state.data.next ? h("p", { class: "note", text: state.data.next.label + ": " + kdate(state.data.next.when.slice(0, 10)) + " " + state.data.next.when.slice(11) + " (KST)" }) : null));
    return root;
  }

  function viewEmpty(msg) { return h("div", { class: "card empty", text: msg }); }

  /* ---------- 라우터 ---------- */
  function route() {
    var hash = location.hash.replace(/^#/, "") || "/";
    var m = hash.match(/^\/briefing\/(.+)$/);
    if (m) return { key: "/", view: function () { return viewBriefing(decodeURIComponent(m[1])); } };
    if (hash === "/news") return { key: "/news", view: viewNews };
    if (hash === "/portfolio") return { key: "/portfolio", view: viewPortfolio };
    if (hash === "/archive") return { key: "/archive", view: viewArchive };
    return { key: "/", view: function () { return viewBriefing(null); } };
  }
  function go(path) { location.hash = "#" + path; }

  function navItem(n, key, tab) {
    return h("a", { href: "#" + n.path, class: tab ? "tab" : null, "aria-current": n.path === key ? "page" : null },
      h("span", { html: ICONS[n.icon], style: "display:contents" }), tab ? h("span", { text: n.label }) : n.label);
  }
  function render() {
    var main = document.getElementById("main"), r = route();
    ["nav-side", "nav-tab"].forEach(function (id) {
      var el = document.getElementById(id); el.textContent = "";
      NAV.forEach(function (n) { el.appendChild(navItem(n, r.key, id === "nav-tab")); });
    });
    main.textContent = "";
    main.appendChild(r.view());
    document.title = "리아 브리핑";
    var u = state.data.meta.updatedAt;
    document.getElementById("side-foot").textContent = "마지막 업데이트 " + u.slice(0, 10) + " " + u.slice(11, 16) + " KST";
    window.scrollTo(0, 0);
  }

  /* ---------- 암호 해제 (Web Crypto: PBKDF2-SHA256 → AES-GCM) ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function deriveKey(pw, e) {
    // 비밀번호는 NFC로 정규화(아이폰 한글 키보드 입력과 맞추기 위해). 키는 추출 불가(extractable=false)로 만들어요.
    return crypto.subtle.importKey("raw", enc.encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(e.salt), iterations: e.iter },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    });
  }
  function decryptWith(key, e) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(e.iv), additionalData: enc.encode(AAD) }, key, b64(e.ct))
      .then(function (buf) { return JSON.parse(dec.decode(buf)); });
  }

  /* ---------- "이 기기에서 기억하기": 비밀번호가 아니라 유도된 키(추출 불가)만 IndexedDB에 저장 ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("ria-briefing", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("vault"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function vault(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("vault", mode), out = fn(tx.objectStore("vault"));
        tx.oncomplete = function () { db.close(); res(out && out.result); }; tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function saveKey(key, e) { return vault("readwrite", function (s) { return s.put({ key: key, salt: e.salt, iter: e.iter, savedAt: Date.now() }, "k"); }); }
  function loadKey(e) {
    return vault("readonly", function (s) { return s.get("k"); }).then(function (v) {
      if (!v || v.salt !== e.salt || v.iter !== e.iter || Date.now() - v.savedAt > REMEMBER_DAYS * 864e5) return null;
      return v.key;
    }).catch(function () { return null; });
  }
  function forgetKey() { return vault("readwrite", function (s) { return s.delete("k"); }).catch(function () {}); }

  /* ---------- 잠금 화면 ---------- */
  function showLock(msg) {
    var box = document.getElementById("lock");
    document.body.classList.add("locked");
    box.hidden = false; box.textContent = "";
    var pw = h("input", { id: "pw", type: "password", autocomplete: "current-password", placeholder: "비밀번호", required: true, "aria-label": "비밀번호", enterkeyhint: "go", autocapitalize: "off", spellcheck: "false" });
    var rem = h("input", { id: "rem", type: "checkbox" });
    var err = h("p", { class: "lock-err", role: "alert", text: msg || "" });
    var btn = h("button", { class: "lock-go", type: "button", text: "열기" });
    var eye = h("button", { class: "lock-eye", type: "button", "aria-label": "비밀번호 보기", text: "보기", onclick: function () {
      var show = pw.type === "password"; pw.type = show ? "text" : "password"; eye.textContent = show ? "숨기기" : "보기"; } });
    function submit() {
      if (!pw.value) { err.textContent = "비밀번호를 입력해 주세요."; pw.focus(); return; }
      if (!window.crypto || !crypto.subtle) { err.textContent = "이 주소에서는 암호 해제를 쓸 수 없어요. https 주소로 열어 주세요."; return; }
      btn.disabled = true; btn.textContent = "여는 중…"; err.textContent = "";
      var key;
      deriveKey(pw.value, state.enc).then(function (k) { key = k; return decryptWith(k, state.enc); }).then(function (data) {
        var keep = rem.checked ? saveKey(key, state.enc).catch(function () {}) : forgetKey();
        return keep.then(function () { pw.value = ""; unlock(data); });
      }).catch(function () {
        btn.disabled = false; btn.textContent = "열기"; pw.select();
        err.textContent = "비밀번호가 맞지 않아요. 다시 확인해 주세요.";
        box.querySelector(".lock-card").classList.remove("shake"); void box.offsetWidth; box.querySelector(".lock-card").classList.add("shake");
      });
    }
    btn.addEventListener("click", submit);
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    box.appendChild(h("div", { class: "lock-card" },
      h("img", { src: "icons/icon-192.png", alt: "", width: "72", height: "72", class: "lock-ico" }),
      h("h1", { text: "리아 브리핑" }),
      h("p", { class: "lock-sub", text: "대표님 전용이에요. 비밀번호를 입력해 주세요." }),
      h("input", { type: "text", autocomplete: "username", value: "ria-briefing", class: "sr", tabindex: "-1", "aria-hidden": "true", readonly: true }),
      h("div", { class: "lock-field" }, pw, eye),
      h("label", { class: "lock-rem" }, rem, h("span", null, "이 기기에서 기억하기 (", REMEMBER_DAYS, "일)")),
      err, btn,
      h("p", { class: "lock-note", text: "자산 정보는 암호화되어 있고, 이 기기 안에서만 풀려요. 비밀번호는 저장하지 않아요." })));
    setTimeout(function () { pw.focus(); }, 50);
  }
  function unlock(data) {
    state.data = data;
    document.body.classList.remove("locked");
    document.getElementById("lock").hidden = true; document.getElementById("lock").textContent = "";
    if (!state.hashBound) { window.addEventListener("hashchange", function () { if (state.data) render(); }); state.hashBound = true; }
    render();
  }
  function lockNow() {
    state.data = null; state.newsReport = null; state.newsCat = "전체"; state.rec = 0;
    document.getElementById("main").textContent = "";
    forgetKey().then(function () { location.hash = "#/"; showLock("잠겼어요. 이 기기에서 로그아웃했어요."); });
  }

  /* ---------- 시작 ---------- */
  function boot() {
    fetch(DATA_URL, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (e) {
      state.enc = e;
      if (!window.crypto || !crypto.subtle) return showLock();
      return loadKey(e).then(function (key) {
        if (!key) return showLock();
        return decryptWith(key, e).then(unlock).catch(function () { return forgetKey().then(function () { showLock(); }); });
      });
    }).catch(function () {
      document.body.classList.add("locked");
      var box = document.getElementById("lock"); box.hidden = false;
      box.appendChild(h("div", { class: "lock-card" }, h("h1", { text: "리아 브리핑" }),
        h("p", { class: "lock-err", text: "데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요." })));
    });
  }
  window.addEventListener("online", function () { state.offline = false; toast("다시 온라인이에요"); if (state.data) render(); });
  window.addEventListener("offline", function () { state.offline = true; toast("오프라인이에요. 저장된 브리핑을 보여드려요"); if (state.data) render(); });
  if ("serviceWorker" in navigator) window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
  document.getElementById("side-lock").addEventListener("click", lockNow);
  boot();
})();
