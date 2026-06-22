(function () {
  "use strict";

  /* ── Tema claro/escuro ──────────────────────────────────── */
  var root = document.documentElement;
  var toggle = document.getElementById("themeToggle");
  var iconSun = document.getElementById("iconSun");
  var iconMoon = document.getElementById("iconMoon");
  var STORAGE_KEY = "adornie-apresentacao-theme";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (iconSun && iconMoon) {
      iconSun.style.display = theme === "dark" ? "block" : "none";
      iconMoon.style.display = theme === "dark" ? "none" : "block";
    }
  }

  var savedTheme = localStorage.getItem(STORAGE_KEY) || "dark";
  applyTheme(savedTheme);

  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(current);
      localStorage.setItem(STORAGE_KEY, current);
    });
  }

  /* ── Revelar ao rolar ───────────────────────────────────── */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in-view"); });
  }

  /* ── Pontos de progresso (navegação por seção) ─────────── */
  var sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
  var dotsWrap = document.getElementById("progressDots");

  if (dotsWrap && sections.length) {
    sections.forEach(function (sec) {
      var dot = document.createElement("button");
      dot.dataset.target = sec.id;
      dot.setAttribute("aria-label", "Ir para " + sec.id.replace("slide-", ""));
      dot.addEventListener("click", function () {
        document.getElementById(sec.id).scrollIntoView({ behavior: "smooth" });
      });
      dotsWrap.appendChild(dot);
    });

    var dots = Array.prototype.slice.call(dotsWrap.children);

    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            dots.forEach(function (d) { d.classList.remove("active"); });
            var match = dots.find ? dots.find(function (d) { return d.dataset.target === entry.target.id; }) : null;
            if (!match) {
              for (var i = 0; i < dots.length; i++) {
                if (dots[i].dataset.target === entry.target.id) { match = dots[i]; break; }
              }
            }
            if (match) match.classList.add("active");
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach(function (sec) { sectionObserver.observe(sec); });
  }
})();
