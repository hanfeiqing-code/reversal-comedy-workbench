(function (root, factory) {
  "use strict";

  var API = factory(root);
  var isCommonJS = typeof module !== "undefined" && module.exports;

  if (isCommonJS) {
    module.exports = API;
    return;
  }

  if (!root || !root.document) return;

  root.WorkbenchShell = API;

  function start() {
    API.init(root.document, root);
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}(
  typeof window !== "undefined" ? window : null,
  function (browserRoot) {
    "use strict";

    var VERSION = 1;
    var STORAGE_KEY = "reversal_comedy_workbench_v1";
    var CONTROLLER_KEY = "__reversalComedyWorkbenchControllerV1";
    var TOOL_CONFIG = {
      coverage: {
        src: "outputs/coverage_reports/coverage_dashboard.html"
      },
      production: {
        src: "app/index.html"
      },
      storyboard: {
        src: "app/storyboard.html"
      }
    };
    var DEFAULT_STATE = {
      version: VERSION,
      activeTool: "coverage",
      sidebarCollapsed: false
    };

    Object.keys(TOOL_CONFIG).forEach(function (tool) {
      Object.freeze(TOOL_CONFIG[tool]);
    });
    Object.freeze(TOOL_CONFIG);
    Object.freeze(DEFAULT_STATE);

    function defaultState() {
      return {
        version: VERSION,
        activeTool: DEFAULT_STATE.activeTool,
        sidebarCollapsed: DEFAULT_STATE.sidebarCollapsed
      };
    }

    function owns(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    }

    function normalizeTool(value) {
      if (typeof value !== "string") return null;
      var tool = value.trim();
      if (tool.charAt(0) === "#") tool = tool.slice(1).trim();
      return owns(TOOL_CONFIG, tool) ? tool : null;
    }

    // 将 iframe 的当前地址归一化为工作台工具名。只看 iframe 路径末段，
    // 因此绝对 URL、file:// URL、相对路径以及带 query/hash 的地址均可识别。
    function toolFromLocation(value) {
      if (value && typeof value === "object") {
        try {
          value = value.href;
        } catch (error) {
          return null;
        }
      }
      if (typeof value !== "string") return null;

      var locationText = value.trim();
      if (!locationText) return null;
      var queryIndex = locationText.indexOf("?");
      var hashIndex = locationText.indexOf("#");
      var cutIndex = locationText.length;
      if (queryIndex >= 0 && queryIndex < cutIndex) cutIndex = queryIndex;
      if (hashIndex >= 0 && hashIndex < cutIndex) cutIndex = hashIndex;
      locationText = locationText.slice(0, cutIndex);

      // 把 Windows 文件路径和 URL 路径都按斜杠处理；末尾斜杠不应
      // 影响已知 html 文件名的判断。
      locationText = locationText.replace(/[\\/]+$/, "");
      var segments = locationText.split(/[\\/]/);
      var basename = segments.length ? segments[segments.length - 1] : "";
      try {
        basename = decodeURIComponent(basename);
      } catch (error) {
        // 非法编码保持原值，继续按普通未知地址处理。
      }
      basename = basename.toLowerCase();

      if (basename === "coverage_dashboard.html") return "coverage";
      if (basename === "index.html") return "production";
      if (basename === "storyboard.html") return "storyboard";
      return null;
    }

    function normalizeState(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return defaultState();
      }
      if (owns(value, "version") && value.version !== VERSION) {
        return defaultState();
      }
      return {
        version: VERSION,
        activeTool: normalizeTool(value.activeTool) || DEFAULT_STATE.activeTool,
        sidebarCollapsed: value.sidebarCollapsed === true
      };
    }

    function readState(storage) {
      try {
        if (!storage || typeof storage.getItem !== "function") return defaultState();
        var serialized = storage.getItem(STORAGE_KEY);
        if (!serialized) return defaultState();
        return normalizeState(JSON.parse(serialized));
      } catch (error) {
        return defaultState();
      }
    }

    function writeState(storage, state) {
      try {
        if (!storage || typeof storage.setItem !== "function") return false;
        storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
        return true;
      } catch (error) {
        return false;
      }
    }

    function getInitialTool(hash, storedState) {
      var hashTool = normalizeTool(hash);
      if (hashTool) return hashTool;

      var storedTool = null;
      if (storedState && typeof storedState === "object") {
        if (!owns(storedState, "version") || storedState.version === VERSION) {
          storedTool = normalizeTool(storedState.activeTool);
        }
      } else {
        storedTool = normalizeTool(storedState);
      }
      return storedTool || DEFAULT_STATE.activeTool;
    }

    function frameAttribute(frame, name) {
      if (!frame || typeof frame.getAttribute !== "function") return null;
      return frame.getAttribute(name);
    }

    function frameIsLoaded(frame) {
      if (frameAttribute(frame, "data-loaded") === "true") return true;
      return Boolean(frame && frame.dataset && frame.dataset.loaded === "true");
    }

    function canonicalFrameSource(frame, canonicalSource) {
      var configured = canonicalSource;
      if (configured && typeof configured === "object") configured = configured.src;
      if (normalizeTool(configured)) configured = TOOL_CONFIG[configured].src;
      if (!configured) {
        var frameTool = normalizeTool(frameAttribute(frame, "data-tool-frame"));
        if (frameTool) configured = TOOL_CONFIG[frameTool].src;
      }
      return typeof configured === "string" ? configured.trim() : "";
    }

    function ensureFrameLoaded(frame, canonicalSource) {
      if (!frame || typeof frame.setAttribute !== "function" || frameIsLoaded(frame)) {
        return false;
      }

      var deferredSource = frameAttribute(frame, "data-src");
      var source = typeof deferredSource === "string" ? deferredSource.trim() : "";
      if (!source) source = canonicalFrameSource(frame, canonicalSource);
      if (!source) return false;

      try {
        frame.setAttribute("src", source);
        frame.setAttribute("data-loaded", "true");
        return true;
      } catch (error) {
        return false;
      }
    }

    function safeStorage(host) {
      try {
        return host && host.localStorage ? host.localStorage : null;
      } catch (error) {
        return null;
      }
    }

    function elements(documentObject, selector) {
      if (!documentObject || typeof documentObject.querySelectorAll !== "function") return [];
      return Array.prototype.slice.call(documentObject.querySelectorAll(selector) || []);
    }

    function elementTool(element, attribute) {
      if (!element || typeof element.getAttribute !== "function") return null;
      return normalizeTool(element.getAttribute(attribute));
    }

    function toggleClass(element, className, enabled) {
      if (element && element.classList && typeof element.classList.toggle === "function") {
        element.classList.toggle(className, enabled);
      }
    }

    function setAttribute(element, name, value) {
      if (element && typeof element.setAttribute === "function") {
        element.setAttribute(name, String(value));
      }
    }

    function setPanelSelected(panel, selected) {
      panel.hidden = !selected;
      toggleClass(panel, "is-active", selected);
      if (selected) {
        if (typeof panel.removeAttribute === "function") panel.removeAttribute("hidden");
      } else {
        setAttribute(panel, "hidden", "");
      }
    }

    function init(documentObject, host) {
      host = host || browserRoot;
      documentObject = documentObject || (host && host.document);
      if (!documentObject || typeof documentObject.querySelector !== "function") return null;

      var shell = documentObject.querySelector("#workbenchShell");
      if (!shell) return null;
      if (shell[CONTROLLER_KEY]) return shell[CONTROLLER_KEY];

      var sidebarToggle = documentObject.querySelector("#sidebarToggle");
      var tabs = elements(documentObject, "[data-tool-tab]");
      var panels = elements(documentObject, "[data-tool-panel]");
      var frames = elements(documentObject, "iframe[data-tool-frame]");
      var frameByTool = {};
      var storage = safeStorage(host);
      var storedState = readState(storage);
      var initialHash = "";

      frames.forEach(function (frame) {
        var tool = elementTool(frame, "data-tool-frame");
        if (tool && !frameByTool[tool]) frameByTool[tool] = frame;
      });

      try {
        initialHash = host && host.location ? host.location.hash : "";
      } catch (error) {
        initialHash = "";
      }

      var state = {
        version: VERSION,
        activeTool: getInitialTool(initialHash, storedState),
        sidebarCollapsed: storedState.sidebarCollapsed === true
      };

      function syncHash(tool) {
        try {
          if (!host || !host.location) return;
          var canonicalHash = "#" + tool;
          if (host.location.hash !== canonicalHash) host.location.hash = canonicalHash;
        } catch (error) {
          return;
        }
      }

      function renderSidebar() {
        var collapsed = state.sidebarCollapsed;
        var label = collapsed ? "展开工具栏" : "收起工具栏";
        toggleClass(shell, "is-sidebar-collapsed", collapsed);
        if (sidebarToggle) {
          setAttribute(sidebarToggle, "aria-expanded", collapsed ? "false" : "true");
          setAttribute(sidebarToggle, "title", label);
          setAttribute(sidebarToggle, "aria-label", label);
        }
      }

      function activate(requestedTool) {
        var tool = normalizeTool(requestedTool);
        if (!tool) return false;

        state.activeTool = tool;
        setAttribute(shell, "data-active-tool", tool);

        tabs.forEach(function (tab) {
          var selected = elementTool(tab, "data-tool-tab") === tool;
          setAttribute(tab, "aria-selected", selected ? "true" : "false");
          setAttribute(tab, "tabindex", selected ? "0" : "-1");
          toggleClass(tab, "is-active", selected);
        });

        panels.forEach(function (panel) {
          setPanelSelected(panel, elementTool(panel, "data-tool-panel") === tool);
        });

        if (frameByTool[tool]) {
          ensureFrameLoaded(frameByTool[tool], TOOL_CONFIG[tool].src);
          restoreFrameSourceIfNavigated(frameByTool[tool], tool);
        }

        writeState(storage, state);
        syncHash(tool);
        return true;
      }

      function toggleSidebar() {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderSidebar();
        writeState(storage, state);
        return state.sidebarCollapsed;
      }

      function syncFromFrame(frame) {
        var frameTool = elementTool(frame, "data-tool-frame");
        if (!frameTool || frameTool !== state.activeTool) return;

        var href = null;
        try {
          var contentWindow = frame.contentWindow;
          if (contentWindow && contentWindow.location) {
            href = contentWindow.location.href;
          }
        } catch (error) {
          return;
        }

        var navigatedTool = toolFromLocation(href);
        if (navigatedTool && navigatedTool !== state.activeTool) {
          activate(navigatedTool);
        }
      }

      function restoreFrameSourceIfNavigated(frame, tool) {
        if (!frame || !tool) return false;

        var href = null;
        try {
          var contentWindow = frame.contentWindow;
          if (contentWindow && contentWindow.location) {
            href = contentWindow.location.href;
          }
        } catch (error) {
          return false;
        }

        var currentTool = toolFromLocation(href);
        if (!currentTool || currentTool === tool) return false;

        try {
          frame.setAttribute("src", TOOL_CONFIG[tool].src);
          frame.setAttribute("data-loaded", "true");
          return true;
        } catch (error) {
          return false;
        }
      }

      function handleTabKeydown(event, tab) {
        var key = event && event.key;
        var currentIndex = tabs.indexOf(tab);
        var targetIndex = null;
        var lastIndex = tabs.length - 1;

        if (currentIndex < 0 || lastIndex < 0) return;

        if (key === "ArrowDown" || key === "ArrowRight") {
          targetIndex = (currentIndex + 1) % tabs.length;
        } else if (key === "ArrowUp" || key === "ArrowLeft") {
          targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (key === "Home") {
          targetIndex = 0;
        } else if (key === "End") {
          targetIndex = lastIndex;
        }

        if (targetIndex === null) return;
        if (event && typeof event.preventDefault === "function") event.preventDefault();

        var targetTab = tabs[targetIndex];
        if (targetTab && typeof targetTab.focus === "function") targetTab.focus();
        activate(elementTool(targetTab, "data-tool-tab"));
      }

      tabs.forEach(function (tab) {
        if (typeof tab.addEventListener !== "function") return;
        tab.addEventListener("click", function () {
          activate(elementTool(tab, "data-tool-tab"));
        });
        tab.addEventListener("keydown", function (event) {
          handleTabKeydown(event, tab);
        });
      });

      if (sidebarToggle && typeof sidebarToggle.addEventListener === "function") {
        sidebarToggle.addEventListener("click", toggleSidebar);
      }

      frames.forEach(function (frame) {
        if (!frame || typeof frame.addEventListener !== "function") return;
        frame.addEventListener("load", function () {
          syncFromFrame(frame);
        });
      });

      if (host && typeof host.addEventListener === "function") {
        host.addEventListener("hashchange", function () {
          var hash = "";
          try {
            hash = host.location ? host.location.hash : "";
          } catch (error) {
            hash = "";
          }
          var tool = normalizeTool(hash);
          // activate() 已先更新当前工具再写入 hash；同工具的同步事件
          // 无需再次激活，避免恢复 iframe src 时产生重复写入。
          if (tool && tool !== state.activeTool) activate(tool);
          else syncHash(state.activeTool);
        });
      }

      renderSidebar();
      activate(state.activeTool);

      var controller = {
        activate: activate,
        toggleSidebar: toggleSidebar,
        getState: function () {
          return normalizeState(state);
        }
      };
      shell[CONTROLLER_KEY] = controller;
      return controller;
    }

    return {
      VERSION: VERSION,
      STORAGE_KEY: STORAGE_KEY,
      TOOL_CONFIG: TOOL_CONFIG,
      DEFAULT_STATE: DEFAULT_STATE,
      normalizeTool: normalizeTool,
      normalizeState: normalizeState,
      readState: readState,
      writeState: writeState,
      getInitialTool: getInitialTool,
      toolFromLocation: toolFromLocation,
      ensureFrameLoaded: ensureFrameLoaded,
      init: init
    };
  }
));
