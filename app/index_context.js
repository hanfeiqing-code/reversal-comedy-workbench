"use strict";

var VOCABULARY_CONTEXT_STORAGE_PREFIX = "vocabulary_context_v1_";
var CHARACTER_LIBRARY_NAME_BY_FRONTEND = {
  "欢欢": "欢欢哥哥",
  "乐乐": "乐乐妹妹"
};
var DEFAULT_SELECTED_CHARACTERS = ["神气猫", "倒霉狗"];
var CHARACTER_SELECTION_STORAGE_KEY = "selected_characters";
var selectedCharacters = DEFAULT_SELECTED_CHARACTERS.slice();
var ROLE_GROUPS = [
  { title: "🐾 动物IP", names: ["神气猫", "倒霉狗", "小白熊", "小白兔", "小黄鸡"] },
  { title: "👨‍👩‍👧 欢乐一家人", names: ["欢乐爸", "欢乐妈", "欢欢", "乐乐", "淘淘表哥", "爷爷", "奶奶"] },
  { title: "🎭 辅助角色", names: ["小猪", "小鸭子", "大灰狼", "大象", "小松鼠"] }
];
var REVERSAL_CATEGORY_ICONS = {
  "认知反转": "🧠",
  "行为喜剧": "🎭",
  "语言概念": "💬",
  "视觉喜剧": "🎨"
};
var REVERSAL_FAMILY_DEFINITIONS = [
  { key: "结果型反转", label: "结果改变", icon: "🎯" },
  { key: "关系型反转", label: "关系变化", icon: "🤝" },
  { key: "认知型反转", label: "认知变化", icon: "🧠" },
  { key: "价值型反转", label: "价值变化", icon: "💎" },
  { key: "协作型反转", label: "协作变化", icon: "🧩" },
  { key: "责任型反转", label: "责任变化", icon: "🛠️" },
  { key: "目标型反转", label: "目标变化", icon: "🧭" }
];
var REVERSAL_FAMILY_ALIASES = {
  "结果改变": "结果型反转",
  "关系变化": "关系型反转",
  "认知变化": "认知型反转",
  "价值变化": "价值型反转",
  "协作变化": "协作型反转",
  "责任变化": "责任型反转",
  "目标变化": "目标型反转"
};
var CHARACTERS = [];

function trimText(value) {
  return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
}

// Keep the browser input adapter consistent with prepare_run.js: `(v/n)` and
// other recognized POS annotations are hints, not slash-delimited targets.
var TARGET_POS_HINT_RE = /\(\s*(?:n|v|adj|adv|prep|pron|det|conj|int|aux|modal|noun|verb|adjective|adverb|preposition|pronoun|determiner|conjunction|interjection)(?:\s*[/,&+]\s*(?:n|v|adj|adv|prep|pron|det|conj|int|aux|modal|noun|verb|adjective|adverb|preposition|pronoun|determiner|conjunction|interjection))*\s*\)/gi;

function stripTargetPosHint(value) {
  var text = trimText(value);
  try {
    text = text.normalize("NFKC");
  } catch (error) {
    // Older browsers may not expose String.prototype.normalize.
  }
  return text.replace(TARGET_POS_HINT_RE, "").trim();
}

function extractTargetBrief(value) {
  var text = stripTargetPosHint(value)
    .replace(/(?:&nbsp;|&#160;|&#x0*a0;)/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
  var label = text.match(/(?:词组|目标词(?:组)?|target[_\s-]*words?)\s*[:：]/i);
  if (!label) {
    return text;
  }
  text = text.slice(label.index + label[0].length);
  var nextLabel = text.search(/(?:当前可使用的?词汇范围|可用词汇范围|词汇范围|vocab(?:ulary)?[_\s-]*range)\s*[:：]/i);
  return (nextLabel >= 0 ? text.slice(0, nextLabel) : text).trim();
}

function storageGet(key) {
  try {
    return window.localStorage ? localStorage.getItem(key) : null;
  } catch (error) {
    return null;
  }
}

function splitCharacterLibraryField(value) {
  var text = trimText(value);
  if (!text) {
    return [];
  }
  return text.split(/[、,，|;；]+/).map(trimText).filter(Boolean);
}

function buildCharactersFromLibrary() {
  var records = (
    typeof CHARACTER_LIBRARY_DATA !== "undefined" &&
    Array.isArray(CHARACTER_LIBRARY_DATA.characters)
  ) ? CHARACTER_LIBRARY_DATA.characters : [];
  var characters = [];

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    characters.push({
      name: record.frontend_name || record.character_name,
      libraryName: record.character_name,
      type: record.character_type || record.character_group || "角色",
      tags: splitCharacterLibraryField(record.personality_tags),
      reversalTypes: splitCharacterLibraryField(record.suitable_reversal)
    });
  }

  if (characters.length) {
    return characters;
  }

  for (var groupIndex = 0; groupIndex < ROLE_GROUPS.length; groupIndex++) {
    for (var nameIndex = 0; nameIndex < ROLE_GROUPS[groupIndex].names.length; nameIndex++) {
      var name = ROLE_GROUPS[groupIndex].names[nameIndex];
      characters.push({
        name: name,
        libraryName: CHARACTER_LIBRARY_NAME_BY_FRONTEND[name] || name,
        type: "角色资料未加载",
        tags: [],
        reversalTypes: []
      });
    }
  }
  return characters;
}

CHARACTERS = buildCharactersFromLibrary();

function getReversalMechanisms() {
  if (
    typeof REVERSAL_MECHANISM_LIBRARY === "undefined" ||
    !Array.isArray(REVERSAL_MECHANISM_LIBRARY.mechanisms)
  ) {
    return [];
  }
  return REVERSAL_MECHANISM_LIBRARY.mechanisms;
}

function getReversalCategories() {
  if (
    typeof REVERSAL_MECHANISM_LIBRARY !== "undefined" &&
    Array.isArray(REVERSAL_MECHANISM_LIBRARY.categories)
  ) {
    return REVERSAL_MECHANISM_LIBRARY.categories;
  }
  var categories = [];
  var counts = {};
  var mechanisms = getReversalMechanisms();
  for (var i = 0; i < mechanisms.length; i++) {
    var category = mechanisms[i].category || "未分类";
    if (!counts[category]) {
      counts[category] = 0;
      categories.push({ name: category, count: 0 });
    }
    counts[category]++;
  }
  for (var j = 0; j < categories.length; j++) {
    categories[j].count = counts[categories[j].name];
  }
  return categories;
}

function reversalCategoryIcon(category) {
  return REVERSAL_CATEGORY_ICONS[category] || "◆";
}

function normalizeReversalFamily(value) {
  var family = trimText(value);
  return REVERSAL_FAMILY_ALIASES[family] || family;
}

function findReversalFamilyDefinition(family) {
  var normalized = normalizeReversalFamily(family);
  for (var i = 0; i < REVERSAL_FAMILY_DEFINITIONS.length; i++) {
    if (REVERSAL_FAMILY_DEFINITIONS[i].key === normalized) {
      return REVERSAL_FAMILY_DEFINITIONS[i];
    }
  }
  return null;
}

function getReversalGroups() {
  var mechanisms = getReversalMechanisms();
  var usesFamilies = mechanisms.some(function (item) {
    return Boolean(normalizeReversalFamily(item.reversal_family));
  });

  if (!usesFamilies) {
    return getReversalCategories().map(function (category) {
      var name = category.name || category;
      return {
        key: name,
        label: name,
        icon: reversalCategoryIcon(name),
        grouping: "category",
        items: mechanisms.filter(function (item) {
          return (item.category || "未分类") === name;
        })
      };
    });
  }

  var itemsByFamily = {};
  var unknownFamilies = [];
  for (var mechanismIndex = 0; mechanismIndex < mechanisms.length; mechanismIndex++) {
    var mechanism = mechanisms[mechanismIndex];
    var family = normalizeReversalFamily(mechanism.reversal_family) || "未分类";
    if (!itemsByFamily[family]) {
      itemsByFamily[family] = [];
      if (!findReversalFamilyDefinition(family)) {
        unknownFamilies.push(family);
      }
    }
    itemsByFamily[family].push(mechanism);
  }

  var groups = [];
  for (var familyIndex = 0; familyIndex < REVERSAL_FAMILY_DEFINITIONS.length; familyIndex++) {
    var definition = REVERSAL_FAMILY_DEFINITIONS[familyIndex];
    if (itemsByFamily[definition.key]) {
      groups.push({
        key: definition.key,
        label: definition.label,
        icon: definition.icon,
        grouping: "family",
        items: itemsByFamily[definition.key]
      });
    }
  }
  unknownFamilies.sort();
  for (var unknownIndex = 0; unknownIndex < unknownFamilies.length; unknownIndex++) {
    var unknownFamily = unknownFamilies[unknownIndex];
    groups.push({
      key: unknownFamily,
      label: unknownFamily,
      icon: "◆",
      grouping: "family",
      items: itemsByFamily[unknownFamily]
    });
  }
  return groups;
}

function findReversalMechanism(mechanismId) {
  var mechanisms = getReversalMechanisms();
  for (var i = 0; i < mechanisms.length; i++) {
    if (String(mechanisms[i].mechanism_id) === String(mechanismId)) {
      return mechanisms[i];
    }
  }
  return null;
}

function shortMechanismText(value, maxLength) {
  var text = trimText(value);
  return text.length <= maxLength ? text : text.substring(0, maxLength - 1) + "…";
}

function findCharacter(name) {
  var target = trimText(name);
  for (var i = 0; i < CHARACTERS.length; i++) {
    if (
      CHARACTERS[i].name === target ||
      CHARACTERS[i].libraryName === target ||
      CHARACTER_LIBRARY_NAME_BY_FRONTEND[target] === CHARACTERS[i].libraryName
    ) {
      return CHARACTERS[i];
    }
  }
  return null;
}

function loadSelectedCharacters() {
  var defaults = DEFAULT_SELECTED_CHARACTERS.slice();
  var saved = storageGet(CHARACTER_SELECTION_STORAGE_KEY);
  if (saved === null) {
    saved = storageGet("selectedCharacters");
  }
  if (saved === null) {
    return defaults;
  }

  var parsed;
  try {
    parsed = JSON.parse(saved);
  } catch (error) {
    parsed = String(saved).split(/[,，、|;；]+/);
  }
  if (!Array.isArray(parsed)) {
    return defaults;
  }

  var valid = [];
  var seen = {};
  for (var i = 0; i < parsed.length; i++) {
    var character = findCharacter(parsed[i]);
    if (character && !seen[character.name]) {
      seen[character.name] = true;
      valid.push(character.name);
    }
  }
  return valid;
}

function isCharacterSelected(name) {
  return selectedCharacters.indexOf(name) !== -1;
}

function saveSelectedCharacters() {
  var boxes = document.querySelectorAll("#characterList input[type='checkbox']");
  var values = [];
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) {
      values.push(boxes[i].value);
    }
  }
  selectedCharacters = values;
  try {
    localStorage.setItem(CHARACTER_SELECTION_STORAGE_KEY, JSON.stringify(values));
  } catch (error) {
    // 离线文件模式下某些浏览器会限制localStorage；不影响本次使用。
  }
}

function handleCharacterSelectionChange() {
  saveSelectedCharacters();
  updateRoleGroupCounts();
}

function toggleAccordion(button) {
  var group = button.parentNode;
  group.classList.toggle("open");
  var arrow = button.querySelector(".role-group-arrow");
  if (arrow) {
    arrow.textContent = group.classList.contains("open") ? "收起" : "展开";
  }
}

function makeElement(tagName, className, textValue) {
  var element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textValue !== undefined) {
    element.appendChild(document.createTextNode(textValue));
  }
  return element;
}

function renderCharacters() {
  var container = document.getElementById("characterList");
  container.innerHTML = "";

  for (var groupIndex = 0; groupIndex < ROLE_GROUPS.length; groupIndex++) {
    var definition = ROLE_GROUPS[groupIndex];
    var group = makeElement("section", "role-group");
    group.setAttribute("data-kind", "characters");
    if (definition.names.some(isCharacterSelected)) {
      group.classList.add("open");
    }

    var title = makeElement("button", "role-group-title");
    title.type = "button";
    title.onclick = function () { toggleAccordion(this); };
    title.appendChild(makeElement("span", "role-group-name", definition.title));
    title.appendChild(makeElement("span", "role-group-count", "0/" + definition.names.length));
    title.appendChild(makeElement(
      "span",
      "role-group-arrow",
      group.classList.contains("open") ? "收起" : "展开"
    ));

    var body = makeElement("div", "role-group-body");
    for (var nameIndex = 0; nameIndex < definition.names.length; nameIndex++) {
      var character = findCharacter(definition.names[nameIndex]);
      if (!character) {
        continue;
      }
      var card = makeElement("label", "role-card");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = character.name;
      checkbox.checked = isCharacterSelected(character.name);
      checkbox.onchange = handleCharacterSelectionChange;

      var content = document.createElement("span");
      content.appendChild(makeElement("div", "role-name", character.name));
      content.appendChild(makeElement(
        "div",
        "role-meta",
        character.type + (character.tags.length ? " · " + character.tags.join("、") : "")
      ));
      if (character.reversalTypes.length) {
        content.appendChild(makeElement(
          "div",
          "role-recommend",
          "适合：" + character.reversalTypes.join("、")
        ));
      }
      card.appendChild(checkbox);
      card.appendChild(content);
      body.appendChild(card);
    }

    group.appendChild(title);
    group.appendChild(body);
    container.appendChild(group);
  }
  updateRoleGroupCounts();
}

function updateRoleGroupCounts() {
  var groups = document.querySelectorAll("#characterList .role-group");
  var total = 0;
  for (var i = 0; i < groups.length; i++) {
    var boxes = groups[i].querySelectorAll("input[type='checkbox']");
    var checked = groups[i].querySelectorAll("input[type='checkbox']:checked").length;
    total += checked;
    var counter = groups[i].querySelector(".role-group-count");
    if (counter) {
      counter.textContent = checked + "/" + boxes.length;
    }
  }

  var summary = document.getElementById("characterSummary");
  summary.className = "role-summary";
  summary.textContent = "当前已选择角色：" + total + "个";
  if (total > 0 && total < 2) {
    summary.textContent += "\n建议选择2—4个角色。";
  } else if (total > 4) {
    summary.textContent += "\n角色较多，可能削弱单集的喜剧焦点。";
    summary.classList.add("warn");
  }
}

function renderReversalMechanisms() {
  var container = document.getElementById("templateList");
  var mechanisms = getReversalMechanisms();
  var groups = getReversalGroups();
  container.innerHTML = "";

  if (!mechanisms.length) {
    container.appendChild(makeElement(
      "div",
      "mechanism-data-error",
      "反转机制库未加载，请确认 reversal_mechanisms_data.js 与本页面位于同一目录。"
    ));
    return;
  }

  for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    var definition = groups[groupIndex];
    var groupItems = definition.items;
    var group = makeElement("section", "role-group mechanism-group");
    group.setAttribute("data-kind", "mechanisms");
    group.setAttribute("data-grouping", definition.grouping);
    group.setAttribute("data-group-key", definition.key);

    var title = makeElement("button", "role-group-title");
    title.type = "button";
    title.onclick = function () { toggleAccordion(this); };
    title.appendChild(makeElement(
      "span",
      "role-group-name",
      definition.icon + " " + definition.label
    ));
    title.appendChild(makeElement("span", "role-group-count", "0/" + groupItems.length));
    title.appendChild(makeElement("span", "role-group-arrow", "展开"));

    var body = makeElement("div", "role-group-body");
    for (var mechanismIndex = 0; mechanismIndex < groupItems.length; mechanismIndex++) {
      var mechanism = groupItems[mechanismIndex];
      var card = makeElement("label", "role-card mechanism-card");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = mechanism.mechanism_id;
      checkbox.onchange = updateMechanismGroupCounts;

      var content = document.createElement("span");
      content.appendChild(makeElement(
        "div",
        "role-name",
        mechanism.mechanism_id + " · " + mechanism.mechanism_name
      ));
      content.appendChild(makeElement(
        "div",
        "mechanism-formula",
        shortMechanismText(mechanism.core_formula, 80)
      ));
      content.appendChild(makeElement(
        "div",
        "role-meta",
        shortMechanismText(
          "铺垫：" + (mechanism.setup || "—") + "；反转：" + (mechanism.twist || "—"),
          120
        )
      ));

      card.appendChild(checkbox);
      card.appendChild(content);
      body.appendChild(card);
    }
    group.appendChild(title);
    group.appendChild(body);
    container.appendChild(group);
  }
  updateMechanismGroupCounts();
}

function updateMechanismGroupCounts() {
  var groups = document.querySelectorAll("#templateList .mechanism-group");
  var total = 0;
  for (var i = 0; i < groups.length; i++) {
    var boxes = groups[i].querySelectorAll("input[type='checkbox']");
    var checked = groups[i].querySelectorAll("input[type='checkbox']:checked").length;
    total += checked;
    var counter = groups[i].querySelector(".role-group-count");
    if (counter) {
      counter.textContent = checked + "/" + boxes.length;
    }
  }
  var summary = document.getElementById("mechanismSummary");
  summary.textContent = "当前已选择反转机制：" + total + "个";
  summary.className = total > 6 ? "role-summary warn" : "role-summary";
  if (total > 6) {
    summary.textContent += "\n建议减少重点机制，让筛选目标更明确。";
  }
}

function updateTemplateMode() {
  var block = document.getElementById("templateCheckboxBlock");
  block.hidden = getTemplateMode() !== "partial";
}

function getTemplateMode() {
  var radios = document.getElementsByName("templateMode");
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      return radios[i].value;
    }
  }
  return "all";
}

function getUrlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch (error) {
    return null;
  }
}

function parseIncomingWords(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return stripTargetPosHint(
          item.word !== undefined ? item.word : item.value
        );
      }
      return stripTargetPosHint(item);
    }).filter(Boolean);
  }
  var text = extractTargetBrief(value);
  if (!text) {
    return [];
  }
  if (text.charAt(0) === "[") {
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(function (item) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            return stripTargetPosHint(
              item.word !== undefined ? item.word : item.value
            );
          }
          return stripTargetPosHint(item);
        }).filter(Boolean);
      }
    } catch (error) {
      // 继续按显式分隔符处理。
    }
  }
  return text.split(/[\r\n,，、|;；/]+/).map(stripTargetPosHint).filter(Boolean);
}

function getStoredTargetWords() {
  var json = storageGet("selected_target_words_json");
  var parsed = parseIncomingWords(json);
  if (parsed.length) {
    return parsed;
  }
  parsed = parseIncomingWords(storageGet("selected_target_words"));
  if (parsed.length) {
    return parsed;
  }
  return parseIncomingWords(storageGet("selected_word_group"));
}

function getUrlWordsParam() {
  return parseIncomingWords(
    getUrlParam("words") ||
    getUrlParam("target_words") ||
    getUrlParam("targetWords")
  );
}

function normalizeSelectionWord(value) {
  if (typeof VocabularyGuard !== "undefined" && VocabularyGuard.normalizeTerm) {
    return VocabularyGuard.normalizeTerm(value);
  }
  return trimText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizedSelectionKey(words) {
  if (!Array.isArray(words) || words.length !== 4) {
    return "";
  }
  return words.map(normalizeSelectionWord).sort().join("|");
}

function storedSelectionMatchesCurrentWords() {
  var current = normalizedSelectionKey(getWords());
  var stored = normalizedSelectionKey(getStoredTargetWords());
  return Boolean(current && stored && current === stored);
}

function getBasicEntries() {
  return (
    typeof VOCABULARY_WHITELIST_DATA !== "undefined" &&
    VOCABULARY_WHITELIST_DATA.basic &&
    Array.isArray(VOCABULARY_WHITELIST_DATA.basic.entries)
  ) ? VOCABULARY_WHITELIST_DATA.basic.entries : [];
}

function getAdvancedGroups() {
  return (
    typeof VOCABULARY_WHITELIST_DATA !== "undefined" &&
    VOCABULARY_WHITELIST_DATA.advanced &&
    Array.isArray(VOCABULARY_WHITELIST_DATA.advanced.groups)
  ) ? VOCABULARY_WHITELIST_DATA.advanced.groups : [];
}

function findAdvancedGroupByWords(words) {
  var wanted = normalizedSelectionKey(words);
  if (!wanted) {
    return null;
  }
  var groups = getAdvancedGroups();
  for (var i = 0; i < groups.length; i++) {
    if (normalizedSelectionKey(groups[i].words || []) === wanted) {
      return groups[i];
    }
  }
  return null;
}

function inferBasicRankUpperFromWords(words) {
  var entries = getBasicEntries();
  var ranks = [];
  var wanted = words.map(normalizeSelectionWord);
  for (var i = 0; i < entries.length; i++) {
    if (wanted.indexOf(normalizeSelectionWord(entries[i].word)) !== -1) {
      ranks.push(Number(entries[i].rank));
    }
  }
  if (ranks.length !== words.length) {
    return 0;
  }
  return Math.max(0, Math.min.apply(Math, ranks) - 1);
}

function inferVocabLevelFromWords(words) {
  if (findAdvancedGroupByWords(words)) {
    return "advanced";
  }
  var entries = getBasicEntries();
  var known = {};
  for (var i = 0; i < entries.length; i++) {
    known[normalizeSelectionWord(entries[i].word)] = true;
  }
  var allBasic = words.length === 4 && words.every(function (word) {
    return Boolean(known[normalizeSelectionWord(word)]);
  });
  return allBasic ? "basic" : "";
}

function getSelectedVocabLevel() {
  var urlLevel = normalizeSelectionWord(
    getUrlParam("level") || getUrlParam("vocab_level")
  );
  if (urlLevel === "basic" || urlLevel === "advanced") {
    return urlLevel;
  }
  if (storedSelectionMatchesCurrentWords()) {
    var storedLevel = normalizeSelectionWord(storageGet("selected_vocab_level"));
    if (storedLevel === "basic" || storedLevel === "advanced") {
      return storedLevel;
    }
  }
  return inferVocabLevelFromWords(getWords()) || "basic";
}

function parseLastInteger(value) {
  var matches = String(value == null ? "" : value).match(/\d+/g);
  return matches && matches.length ? Number(matches[matches.length - 1]) : null;
}

function getSelectedBasicRankUpper() {
  if (
    getSelectedVocabLevel() === "advanced" &&
    typeof VOCABULARY_WHITELIST_DATA !== "undefined"
  ) {
    return Number(VOCABULARY_WHITELIST_DATA.basic.max_rank);
  }

  var explicit = parseLastInteger(
    getUrlParam("basic_rank_max") || getUrlParam("basicRankMax") ||
    getUrlParam("basic_order_rank") || getUrlParam("basic_order_rank_max")
  );
  if (explicit !== null) {
    return explicit;
  }
  if (storedSelectionMatchesCurrentWords()) {
    explicit = parseLastInteger(storageGet("selected_basic_rank_upper"));
    if (explicit !== null) {
      return explicit;
    }
    explicit = parseLastInteger(
      storageGet("basic_order_rank") || storageGet("basic_order_rank_max")
    );
    if (explicit !== null) {
      return explicit;
    }
    explicit = parseLastInteger(storageGet("learned_vocab_rank_range"));
    if (explicit !== null) {
      return explicit;
    }
  }
  return inferBasicRankUpperFromWords(getWords());
}

function getSelectedAdvancedGroupId() {
  if (getSelectedVocabLevel() !== "advanced") {
    return null;
  }
  var explicit = parseLastInteger(
    getUrlParam("advanced_group_id") || getUrlParam("advancedGroupId")
  );
  if (explicit !== null) {
    return explicit;
  }
  if (storedSelectionMatchesCurrentWords()) {
    explicit = parseLastInteger(
      storageGet("selected_advanced_current_group_id") ||
      storageGet("selected_current_advanced_group_id")
    );
    if (explicit !== null) {
      return explicit;
    }
  }
  var group = findAdvancedGroupByWords(getWords());
  return group ? Number(group.group_id) : null;
}

function getSelectedLearnedWords() {
  return storageGet("selected_learned_words") ||
    storageGet("selected_learned_word_range") ||
    valueOf("learnedWords") ||
    "";
}

function getLearnedVocabSource() {
  return storageGet("learned_vocab_source") ||
    (getSelectedVocabLevel() === "advanced"
      ? "master_vocab_basic_with_pos.xlsx + master_vocab_advanced.xlsx"
      : "master_vocab_basic_with_pos.xlsx");
}

function getLearnedVocabRankRange() {
  return storageGet("learned_vocab_rank_range") ||
    storageGet("selected_advanced_learned_group_range") ||
    "";
}

function getSelectedHelperWords() {
  return storageGet("selected_helper_words") || "";
}

function setStoryMode(mode) {
  var safeMode = mode === "long" ? "long" : "short";
  var radios = document.getElementsByName("storyMode");
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = radios[i].value === safeMode;
  }
}

function fillWordsFromIncomingSelection() {
  var incoming = getUrlWordsParam();
  if (incoming.length > 4) {
    showError("传入目标词超过4个；当前短篇任务必须明确提供恰好4个目标词。");
    return;
  }
  if (incoming.length !== 4) {
    incoming = getStoredTargetWords();
  }
  if (incoming.length > 4) {
    showError("已保存的目标词超过4个；请先整理为恰好4个目标词。");
    return;
  }
  if (incoming.length === 4) {
    for (var i = 0; i < 4; i++) {
      document.getElementById("word" + (i + 1)).value = incoming[i];
    }
  }

  var incomingMode = getUrlParam("mode");
  if (incomingMode === "short" || incomingMode === "long") {
    setStoryMode(incomingMode);
  }

  var group = findAdvancedGroupByWords(getWords());
  if (group) {
    document.getElementById("groupId").value = "AG" + group.group_id;
  }
  var learned = getSelectedLearnedWords();
  if (learned) {
    document.getElementById("learnedWords").value = learned;
  }
  updateTaskModeNotice();
}

function updateTaskModeNotice() {
  var notice = document.getElementById("taskModeNotice");
  var words = getWords().filter(Boolean);
  if (words.length !== 4) {
    notice.hidden = true;
    return;
  }

  var level = getSelectedVocabLevel();
  var duration = getStoryMode() === "long" ? "90秒以上中长篇" : "30—60秒短篇";
  if (level === "advanced") {
    notice.textContent =
      "当前识别为高级词汇任务：" + duration +
      "。默认全部基础词已学；先建立独立成立的有趣视觉故事，再把能自然进入场景的高级目标词用于真实交流。";
  } else {
    notice.textContent =
      "当前识别为基础词汇任务：" + duration +
      "。先完成不依赖英文也成立的角色行动与视觉反转，再自然匹配目标词。";
  }
  notice.hidden = false;
}

function buildCurrentVocabularyContext(data) {
  if (
    typeof VOCABULARY_WHITELIST_DATA === "undefined" ||
    typeof VocabularyGuard === "undefined"
  ) {
    throw new Error("离线词表或词汇守卫未加载。");
  }
  var context = VocabularyGuard.buildVocabularyContext({
    mode: data.story_mode,
    vocabLevel: data.vocabLevel,
    targetWords: data.words,
    basicRankMax: data.basicRankMax,
    advancedGroupId: data.advancedGroupId,
    sourceFingerprint: VOCABULARY_WHITELIST_DATA.source_fingerprint
  }, VOCABULARY_WHITELIST_DATA);
  if (!context.valid) {
    throw new Error(context.errors.join("；"));
  }
  return context;
}

function saveVocabularyContext(context) {
  if (!context || !context.mode) {
    return;
  }
  try {
    localStorage.setItem(
      VOCABULARY_CONTEXT_STORAGE_PREFIX + context.mode,
      JSON.stringify(context)
    );
  } catch (error) {
    throw new Error("浏览器未允许本地保存词汇上下文，请检查本地文件权限。");
  }
}

function renderVocabularyContextPreview(context) {
  var box = document.getElementById("vocabularyContextPreview");
  if (!context) {
    box.className = "vocab-context-card pending";
    box.textContent = "请填写4个目标词，页面将自动建立离线白名单任务摘要。";
    return;
  }
  if (!context.valid) {
    box.className = "vocab-context-card error-state";
    box.textContent = "词汇上下文未建立：" + context.errors.join("；");
    return;
  }

  var range;
  if (context.vocab_level === "advanced") {
    range = context.advanced_group_id > 1
      ? "全部基础词 + 高级Group 1—" + (context.advanced_group_id - 1) + " + 当前4词"
      : "全部基础词 + 无前序高级组 + 当前4词";
  } else {
    range = context.basic_rank_max > 0
      ? "基础Rank 1—" + context.basic_rank_max + " + 当前4词"
      : "无前序基础词 + 当前4词";
  }
  box.className = "vocab-context-card";
  box.textContent =
    "白名单上下文已就绪｜模式：" + context.mode +
    "｜层级：" + context.vocab_level +
    "｜允许范围：" + range +
    "｜任务指纹：" + context.task_fingerprint;
}

function refreshVocabularyContextPreview() {
  updateTaskModeNotice();
  var words = getWords().filter(Boolean);
  if (words.length !== 4) {
    renderVocabularyContextPreview(null);
    return;
  }
  try {
    var data = collectData();
    renderVocabularyContextPreview(buildCurrentVocabularyContext(data));
  } catch (error) {
    renderVocabularyContextPreview({
      valid: false,
      errors: [error && error.message ? error.message : "无法建立词汇上下文。"]
    });
  }
}

function valueOf(id) {
  var element = document.getElementById(id);
  return element ? trimText(element.value) : "";
}

function getWords() {
  return [
    stripTargetPosHint(valueOf("word1")),
    stripTargetPosHint(valueOf("word2")),
    stripTargetPosHint(valueOf("word3")),
    stripTargetPosHint(valueOf("word4"))
  ];
}

function formatCharacterForPrompt(name) {
  var character = findCharacter(name);
  return character ? character.libraryName : name;
}

function getCharacters() {
  var boxes = document.querySelectorAll("#characterList input[type='checkbox']:checked");
  var selected = [];
  for (var i = 0; i < boxes.length; i++) {
    selected.push(formatCharacterForPrompt(boxes[i].value));
  }
  return selected;
}

function getSelectedReversalMechanisms() {
  var boxes = document.querySelectorAll("#templateList input[type='checkbox']:checked");
  var selected = [];
  for (var i = 0; i < boxes.length; i++) {
    var mechanism = findReversalMechanism(boxes[i].value);
    if (mechanism) {
      selected.push({
        mechanism_id: mechanism.mechanism_id,
        mechanism_name: mechanism.mechanism_name
      });
    }
  }
  return selected;
}

function getSelectedTemplates() {
  return getSelectedReversalMechanisms().map(function (item) {
    return item.mechanism_name;
  });
}

function showError(message) {
  var box = document.getElementById("errorBox");
  if (!box) {
    window.alert(message);
    return;
  }
  box.textContent = message;
  box.style.display = "block";
  if (typeof box.scrollIntoView === "function") {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function hideError() {
  var box = document.getElementById("errorBox");
  box.textContent = "";
  box.style.display = "none";
}

function getStoryMode() {
  var radios = document.getElementsByName("storyMode");
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      return radios[i].value;
    }
  }
  return "short";
}

function storyModeDisplayLabel(storyMode) {
  return storyMode === "long"
    ? "中长篇绘本（90秒以上）"
    : "短篇绘本（30—60秒）";
}

function collectData() {
  var selectedMechanisms = getSelectedReversalMechanisms();
  var storyMode = getStoryMode();
  var selectedCharacterNames = getCharacters();
  return {
    storyMode: storyMode,
    story_mode: storyMode,
    groupId: valueOf("groupId") || "未填写",
    words: getWords(),
    learnedWords: valueOf("learnedWords") || "无",
    vocabLevel: getSelectedVocabLevel(),
    selectedLearnedWords: getSelectedLearnedWords(),
    learnedVocabSource: getLearnedVocabSource(),
    learnedVocabRankRange: getLearnedVocabRankRange(),
    basicRankMax: getSelectedBasicRankUpper(),
    advancedGroupId: getSelectedAdvancedGroupId(),
    selectedHelperWords: getSelectedHelperWords(),
    ageRange: valueOf("ageRange") || "3-10岁",
    characters: selectedCharacterNames,
    selected_characters: selectedCharacterNames,
    templateMode: getTemplateMode(),
    templates: selectedMechanisms.map(function (item) { return item.mechanism_name; }),
    selectedReversalMechanisms: selectedMechanisms,
    selected_reversal_mechanisms: selectedMechanisms,
    // The browser adapter cannot inspect the seven knowledge workbooks. Keep
    // these values explicitly unverified until an external Step00/orchestrator
    // injects a real status and fingerprint; never manufacture READY here.
    knowledge_context_status: "KNOWLEDGE_CONTEXT_UNVERIFIED",
    knowledge_source_fingerprint: "UNVERIFIED",
    allowFusion: document.getElementById("allowFusion").checked,
    allowFreeReversal: document.getElementById("allowFreeReversal").checked,
    extraLimits: valueOf("extraLimits") || "无"
  };
}

function validateData(data) {
  var words = data.words.map(trimText).filter(Boolean);
  if (words.length !== 4) {
    showError("请填写本组4个生词。");
    return false;
  }
  var seen = {};
  for (var i = 0; i < words.length; i++) {
    seen[normalizeSelectionWord(words[i])] = true;
  }
  if (Object.keys(seen).length !== 4) {
    showError("4个生词不能重复。");
    return false;
  }
  if (!data.characters.length) {
    showError("请至少选择1个角色。");
    return false;
  }
  if (
    data.templateMode === "partial" &&
    !data.selectedReversalMechanisms.length
  ) {
    showError("重点参考模式下，请至少选择1个反转机制。");
    return false;
  }
  hideError();
  return true;
}

function bindPageEvents() {
  var wordIds = ["word1", "word2", "word3", "word4"];
  for (var i = 0; i < wordIds.length; i++) {
    document.getElementById(wordIds[i]).addEventListener("input", refreshVocabularyContextPreview);
  }
  var storyModes = document.getElementsByName("storyMode");
  for (var modeIndex = 0; modeIndex < storyModes.length; modeIndex++) {
    storyModes[modeIndex].addEventListener("change", refreshVocabularyContextPreview);
  }
  var templateModes = document.getElementsByName("templateMode");
  for (var templateIndex = 0; templateIndex < templateModes.length; templateIndex++) {
    templateModes[templateIndex].addEventListener("change", updateTemplateMode);
  }
  document.getElementById("generateButton").addEventListener("click", generatePrompts);
  document.getElementById("copyAllButton").addEventListener("click", copyAllPrompts);
  document.getElementById("clearButton").addEventListener("click", clearPrompts);
  window.addEventListener("focus", refreshVocabularyContextPreview);
}

function initPage() {
  selectedCharacters = loadSelectedCharacters();
  renderCharacters();
  renderReversalMechanisms();
  updateTemplateMode();
  fillWordsFromIncomingSelection();
  bindPageEvents();
  refreshVocabularyContextPreview();
}
