Warning: fs was declared with const; use let for reassignable variables.
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.VocabularyGuard = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DATA_SCHEMA = "vocabulary-whitelist-data-v1";
  var CONTEXT_SCHEMA = "vocabulary-context-v1";
  var indexCache = typeof WeakMap === "function" ? new WeakMap() : null;

  var APOSTROPHE_RE = /[\u2018\u2019\u02bc\u2032]/g;
  var DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]/g;
  var ENGLISH_RE = /[A-Za-z]/;
  var CJK_RE = /[\u3400-\u9fff]/;
  var WORD_RE = /[A-Za-z]+(?:['-][A-Za-z]+)*(?:\.)?/g;
  var VERB_NO_DERIVATION = new Set([
    "am", "are", "is", "was", "were", "has", "does", "did", "got", "had",
    "bought", "made", "found", "went", "saw", "stole", "gave", "ate", "caught",
    "fell", "said", "slept", "thought", "won", "felt", "came", "bit", "lost",
    "let's", "isn't", "i'd", "going", "running", "doing", "eating", "fishing",
    "crying", "working", "bouncing", "cutting", "cracking", "crossing", "driving",
    "moving", "opening", "resting", "shining", "skiing", "washing"
  ]);
  var VERB_NO_THIRD_PERSON = new Set([
    "be", "have", "can", "could", "may", "might", "must", "shall", "should", "will", "would"
  ]);
  var VERB_IRREGULAR_PAST = new Set([
    "arise", "awake", "be", "bear", "beat", "become", "begin", "bend", "bet", "bind",
    "bite", "bleed", "blow", "break", "breed", "bring", "broadcast", "build", "burst",
    "buy", "catch", "choose", "come", "cost", "cut", "deal", "dig", "do", "draw",
    "drink", "drive", "eat", "fall", "feed", "feel", "fight", "find", "flee", "fly",
    "forbid", "forget", "forgive", "freeze", "get", "give", "go", "grow", "have",
    "hear", "hide", "hit", "hold", "hurt", "keep", "know", "lay", "lead", "leave",
    "lend", "let", "lie", "lose", "make", "mean", "meet", "pay", "put", "read",
    "ride", "ring", "rise", "run", "say", "see", "sell", "send", "set", "shake",
    "shoot", "show", "shut", "sing", "sink", "sit", "sleep", "slide", "speak",
    "spend", "spin", "split", "spread", "stand", "steal", "stick", "sting", "stink",
    "strike", "swim", "swing", "take", "teach", "tear", "tell", "think", "throw",
    "understand", "wake", "wear", "win", "write"
  ]);
  var VERB_REQUIRES_DOUBLING = new Set([
    "admit", "begin", "clap", "dig", "drop", "fit", "flip", "forget", "get", "grab",
    "hop", "hug", "kid", "nod", "plan", "prefer", "put", "quit", "rob", "run",
    "shop", "sit", "skip", "slap", "slip", "stop", "swim", "trap", "trip", "win"
  ]);
  var NOUN_IRREGULAR_PLURAL = new Set([
    "child", "person", "man", "woman", "mouse", "tooth", "foot", "goose", "sheep", "deer", "fish"
  ]);

  var FIELD_PREFIXES = [
    "人物", "角色", "场景", "预计时长", "时长", "主线目标", "阶段目标",
    "升级类型", "主要角色变化", "场景推进路径", "关键前置线索",
    "本剧本学习台词目标词", "学习台词目标词", "目标词", "词汇",
    "核心反转", "最终核心反转", "结尾余味", "节点功能",
    "音效", "声音", "SFX", "sound", "音效说明",
    "动作", "动作说明", "动作描述", "表情", "镜头", "运镜", "景别",
    "制作备注", "制作说明", "动画说明", "分镜", "草图", "草图描述",
    "道具", "场景说明", "seedance",
    "target_words", "characters", "story_summary", "story_length_type",
    "funny_point", "selected_characters", "mode", "vocab_level"
  ];

  var SEGMENT_LABELS = {
    subtitle: /^(?:英文)?字幕|^subtitle$/i,
    narration: /^(?:英文)?旁白|^narration$/i,
    on_screen_text: /^(?:画面|屏幕|背景|镜头内|画面内)(?:英文)?文字|^on[- ]?screen text$/i,
    dialogue: /^(?:英文)?(?:台词|对白)|^dialogue$|^line$/i
  };
  var LIGHTWEIGHT_FINAL_CHECK_RE =
    /^(?:#{1,6}\s*)?(?:\*\*|__)?轻量成稿检查(?:\*\*|__)?\s*(?:[：:]|$)/;

  function toString(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function normalizeUnicode(value) {
    var text = toString(value);
    if (typeof text.normalize === "function") {
      text = text.normalize("NFKC");
    }
    return text.replace(APOSTROPHE_RE, "'").replace(DASH_RE, "-");
  }

  function normalizeTerm(value) {
    return normalizeUnicode(value).toLowerCase().trim().replace(/\s+/g, " ");
  }

  function padStoryNo(value) {
    var match = toString(value).match(/\d{1,2}/);
    if (!match) {
      return "";
    }
    return String(Number(match[0])).padStart(2, "0");
  }

  function parseLastInteger(value) {
    if (typeof value === "number") {
      return Number.isInteger(value) ? value : NaN;
    }
    var matches = toString(value).match(/\d+/g);
    return matches && matches.length ? Number(matches[matches.length - 1]) : NaN;
  }

  function normalizeLevel(value) {
    var level = normalizeTerm(value);
    if (level === "basic" || level === "初级" || level === "基础") {
      return "basic";
    }
    if (level === "advanced" || level === "高级") {
      return "advanced";
    }
    return "";
  }

  function stableCopy(value) {
    if (Array.isArray(value)) {
      return value.map(stableCopy);
    }
    if (value && typeof value === "object") {
      var result = {};
      Object.keys(value).sort().forEach(function (key) {
        if (value[key] !== undefined) {
          result[key] = stableCopy(value[key]);
        }
      });
      return result;
    }
    return value;
  }

  function fnv1a32(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function fingerprintContext(context) {
    var targetWords = Array.isArray(context && context.target_words)
      ? context.target_words.map(function (item) {
        return {
          word: normalizeTerm(item && item.word !== undefined ? item.word : item),
          pos: normalizeTerm(item && item.pos)
        };
      }).sort(function (left, right) {
        return (left.word + "|" + left.pos).localeCompare(right.word + "|" + right.pos);
      })
      : [];
    var fingerprintPayload = {
      schema_version: CONTEXT_SCHEMA,
      source_fingerprint: toString(context && context.source_fingerprint),
      mode: toString(context && context.mode),
      vocab_level: toString(context && context.vocab_level),
      basic_rank_max: Number(context && context.basic_rank_max) || 0,
      advanced_group_id: Number(context && context.advanced_group_id) || 0,
      target_words: targetWords
    };
    return "vctx1-" + fnv1a32(JSON.stringify(stableCopy(fingerprintPayload)));
  }

  function validateDataShape(data) {
    var errors = [];
    if (!data || typeof data !== "object") {
      return ["缺少VOCABULARY_WHITELIST_DATA。"];
    }
    if (data.schema_version !== DATA_SCHEMA) {
      errors.push("词表数据schema_version必须为" + DATA_SCHEMA + "。");
    }
    if (!toString(data.source_fingerprint)) {
      errors.push("词表数据缺少source_fingerprint。");
    }
    if (!data.basic || !Array.isArray(data.basic.entries) || !data.basic.entries.length) {
      errors.push("词表数据缺少basic.entries。");
    }
    if (!data.advanced || !Array.isArray(data.advanced.groups) || !data.advanced.groups.length) {
      errors.push("词表数据缺少advanced.groups。");
    }
    return errors;
  }

  function parseTargetWords(value) {
    var items;
    if (Array.isArray(value)) {
      items = value;
    } else {
      items = toString(value).split(/[\/|,，、;\n]+/);
    }
    return items.map(function (item) {
      if (item && typeof item === "object") {
        return {
          word: toString(item.word !== undefined ? item.word : item.value).trim(),
          pos: normalizeTerm(item.pos || item.part_of_speech || "")
        };
      }
      return { word: toString(item).trim(), pos: "" };
    }).filter(function (item) {
      return Boolean(item.word);
    });
  }

  function parseWordSelection(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return toString(item).trim(); })
        .filter(Boolean).slice(0, 4);
    }
    var text = toString(value).trim();
    if (!text) {
      return [];
    }
    if (/^\s*\[/.test(text)) {
      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parseWordSelection(parsed);
        }
      } catch (error) {
        /* 继续按旧版显式分隔符解析 */
      }
    }
    return text.split(/[,，、/|;；\r\n\t]+/).map(function (item) {
      return item.trim();
    }).filter(Boolean).slice(0, 4);
  }

  function buildVocabularyContext(options, data) {
    options = options || {};
    var errors = validateDataShape(data);
    var warnings = [];
    var mode = normalizeTerm(options.mode);
    var level = normalizeLevel(
      options.vocabLevel || options.vocab_level || options.level
    );
    if (mode !== "short" && mode !== "long") {
      errors.push("mode必须为short或long。");
    }
    if (!level) {
      errors.push("vocabLevel必须为basic/初级或advanced/高级。");
    }

    var targets = parseTargetWords(
      options.targetWords !== undefined ? options.targetWords : options.target_words
    );
    if (targets.length !== 4) {
      errors.push("当前工作流必须恰好提供4个目标词。");
    }

    var basicEntries = data && data.basic && Array.isArray(data.basic.entries)
      ? data.basic.entries : [];
    var basicByWord = new Map();
    basicEntries.forEach(function (entry) {
      basicByWord.set(normalizeTerm(entry.word), entry);
    });
    var seenTargets = new Set();
    targets = targets.map(function (target) {
      var normalized = normalizeTerm(target.word);
      if (!normalized) {
        errors.push("目标词包含空值或无效内容。");
      } else if (seenTargets.has(normalized)) {
        errors.push("目标词重复：" + target.word + "。");
      }
      seenTargets.add(normalized);
      var basicEntry = basicByWord.get(normalized);
      return {
        word: target.word,
        normalized: normalized,
        pos: target.pos || normalizeTerm(basicEntry && basicEntry.pos)
      };
    });

    var basicRankSource = options.basicRankMax;
    if (basicRankSource === undefined) {
      basicRankSource = options.basic_rank_max;
    }
    if (basicRankSource === undefined) {
      basicRankSource = options.learnedVocabRankRange;
    }
    if (basicRankSource === undefined) {
      basicRankSource = options.learned_vocab_rank_range;
    }
    var basicRankMax = level === "advanced"
      ? Number(data && data.basic && data.basic.max_rank)
      : parseLastInteger(basicRankSource);
    var dataBasicMax = Number(data && data.basic && data.basic.max_rank);
    if (!Number.isInteger(basicRankMax) || basicRankMax < 0 || basicRankMax > dataBasicMax) {
      errors.push(
        "basicRankMax必须是0-" + (Number.isFinite(dataBasicMax) ? dataBasicMax : "?") + "之间的整数。"
      );
    }

    var advancedGroupSource = options.advancedGroupId;
    if (advancedGroupSource === undefined) {
      advancedGroupSource = options.advanced_group_id;
    }
    if (advancedGroupSource === undefined) {
      advancedGroupSource = options.groupId;
    }
    var advancedGroupId = level === "advanced"
      ? parseLastInteger(advancedGroupSource)
      : null;
    var dataAdvancedMax = Number(data && data.advanced && data.advanced.max_group);
    if (
      level === "advanced" &&
      (!Number.isInteger(advancedGroupId) ||
        advancedGroupId < 1 ||
        advancedGroupId > dataAdvancedMax)
    ) {
      errors.push(
        "advancedGroupId必须是1-" +
        (Number.isFinite(dataAdvancedMax) ? dataAdvancedMax : "?") +
        "之间的整数。"
      );
    }

    var suppliedFingerprint = toString(
      options.sourceFingerprint || options.source_fingerprint
    );
    if (
      suppliedFingerprint &&
      data &&
      suppliedFingerprint !== toString(data.source_fingerprint)
    ) {
      errors.push("指定的词表版本与当前离线词表不一致。");
    }

    var context = {
      schema_version: CONTEXT_SCHEMA,
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      mode: mode,
      vocab_level: level,
      target_words: targets,
      basic_rank_max: Number.isInteger(basicRankMax) ? basicRankMax : null,
      advanced_group_id: Number.isInteger(advancedGroupId) ? advancedGroupId : null,
      source_fingerprint: toString(data && data.source_fingerprint)
    };
    context.task_fingerprint = fingerprintContext(context);
    return context;
  }

  function posKinds(pos) {
    var parts = normalizeTerm(pos).split(/[\s/,;|]+/).filter(Boolean);
    return {
      noun: parts.some(function (part) {
        return part === "n" || part === "noun";
      }),
      verb: parts.some(function (part) {
        return part === "v" || part === "verb";
      })
    };
  }

  function consonantY(word) {
    return /[^aeiou]y$/.test(word);
  }

  function addForm(result, form, kind) {
    if (form && !result.some(function (item) { return item.form === form; })) {
      result.push({ form: form, kind: kind });
    }
  }

  function generateInflections(base, pos) {
    var word = normalizeTerm(base);
    var kinds = posKinds(pos);
    var result = [];
    if (!/^[a-z]+$/.test(word)) {
      return result;
    }
    if (kinds.noun && !NOUN_IRREGULAR_PLURAL.has(word)) {
      if (consonantY(word)) {
        addForm(result, word.slice(0, -1) + "ies", "noun_plural_ies");
      } else if (/(?:s|x|z|ch|sh|o)$/.test(word)) {
        addForm(result, word + "es", "noun_plural_es");
      } else {
        addForm(result, word + "s", "noun_plural_s");
      }
    }
    if (kinds.verb && !VERB_NO_DERIVATION.has(word)) {
      if (!VERB_NO_THIRD_PERSON.has(word)) {
        if (consonantY(word)) {
          addForm(result, word.slice(0, -1) + "ies", "verb_third_person_ies");
        } else if (/(?:s|x|z|ch|sh|o)$/.test(word)) {
          addForm(result, word + "es", "verb_third_person_es");
        } else {
          addForm(result, word + "s", "verb_third_person_s");
        }
      }

      if (!VERB_IRREGULAR_PAST.has(word) && !VERB_REQUIRES_DOUBLING.has(word)) {
        if (consonantY(word)) {
          addForm(result, word.slice(0, -1) + "ied", "verb_past_ied");
        } else if (/e$/.test(word)) {
          addForm(result, word + "d", "verb_past_ed");
        } else {
          addForm(result, word + "ed", "verb_past_ed");
        }
      }

      if (!VERB_REQUIRES_DOUBLING.has(word)) {
        if (/ie$/.test(word)) {
          addForm(result, word.slice(0, -2) + "ying", "verb_ing_ie");
        } else if (/(?:ee|ye|oe)$/.test(word)) {
          addForm(result, word + "ing", "verb_ing_keep_e");
        } else if (/e$/.test(word) && word !== "be") {
          addForm(result, word.slice(0, -1) + "ing", "verb_ing_e_drop");
        } else if (word !== "be") {
          addForm(result, word + "ing", "verb_ing");
        }
      }
    }
    return result;
  }

  function createIndexes(data) {
    if (indexCache && indexCache.has(data)) {
      return indexCache.get(data);
    }
    var basicMap = new Map();
    var advancedMap = new Map();
    var knownTerms = new Set();
    var periodTerms = new Set();
    var inflectionMap = new Map();
    var maxPhraseLength = 1;

    (data.basic.entries || []).forEach(function (entry) {
      var normalized = normalizeTerm(entry.word);
      var record = {
        word: entry.word,
        normalized: normalized,
        rank: Number(entry.rank),
        pos: normalizeTerm(entry.pos)
      };
      basicMap.set(normalized, record);
      knownTerms.add(normalized);
      if (normalized.endsWith(".")) {
        periodTerms.add(normalized);
      }
      maxPhraseLength = Math.max(maxPhraseLength, normalized.split(" ").length);
      generateInflections(normalized, record.pos).forEach(function (form) {
        var candidates = inflectionMap.get(form.form) || [];
        candidates.push({
          base: normalized,
          base_word: entry.word,
          pos: record.pos,
          kind: form.kind
        });
        inflectionMap.set(form.form, candidates);
      });
    });

    (data.advanced.groups || []).forEach(function (group) {
      (group.words || []).forEach(function (word) {
        var normalized = normalizeTerm(word);
        advancedMap.set(normalized, {
          word: word,
          normalized: normalized,
          group_id: Number(group.group_id)
        });
        knownTerms.add(normalized);
        if (normalized.endsWith(".")) {
          periodTerms.add(normalized);
        }
        maxPhraseLength = Math.max(maxPhraseLength, normalized.split(" ").length);
      });
    });

    var indexes = {
      basicMap: basicMap,
      advancedMap: advancedMap,
      knownTerms: knownTerms,
      periodTerms: periodTerms,
      inflectionMap: inflectionMap,
      maxPhraseLength: maxPhraseLength
    };
    if (indexCache) {
      indexCache.set(data, indexes);
    }
    return indexes;
  }

  function targetIndex(context) {
    var terms = new Map();
    var inflections = new Map();
    var maxPhraseLength = 1;
    (context.target_words || []).forEach(function (item) {
      var normalized = normalizeTerm(item.normalized || item.word);
      if (!normalized) {
        return;
      }
      terms.set(normalized, item);
      maxPhraseLength = Math.max(maxPhraseLength, normalized.split(" ").length);
      if (item.pos) {
        generateInflections(normalized, item.pos).forEach(function (form) {
          var candidates = inflections.get(form.form) || [];
          candidates.push({
            base: normalized,
            base_word: item.word,
            pos: item.pos,
            kind: form.kind,
            target: true
          });
          inflections.set(form.form, candidates);
        });
      }
    });
    return {
      terms: terms,
      inflections: inflections,
      maxPhraseLength: maxPhraseLength
    };
  }

  function exactStatus(term, context, indexes, targets) {
    if (targets.terms.has(term)) {
      return { allowed: true, source: "current_target", entry: targets.terms.get(term) };
    }
    if (indexes.basicMap.has(term)) {
      var basic = indexes.basicMap.get(term);
      if (context.vocab_level === "advanced" || basic.rank <= context.basic_rank_max) {
        return { allowed: true, source: "basic", entry: basic };
      }
      return {
        allowed: false,
        reason_code: "FUTURE_BASIC_RANK",
        reason: "该词的basic_order_rank为" + basic.rank +
          "，超过当前上限" + context.basic_rank_max + "。",
        entry: basic
      };
    }
    if (indexes.advancedMap.has(term)) {
      var advanced = indexes.advancedMap.get(term);
      if (context.vocab_level === "advanced" && advanced.group_id < context.advanced_group_id) {
        return { allowed: true, source: "learned_advanced", entry: advanced };
      }
      if (context.vocab_level === "advanced") {
        return {
          allowed: false,
          reason_code: "FUTURE_ADVANCED_GROUP",
          reason: "该词位于高级Group " + advanced.group_id +
            "，不属于当前目标词，也不在Group 1-" +
            Math.max(0, context.advanced_group_id - 1) + "的已学范围内。",
          entry: advanced
        };
      }
      return {
        allowed: false,
        reason_code: "ADVANCED_WORD_NOT_ALLOWED",
        reason: "该词属于高级词表，当前基础任务不可使用。",
        entry: advanced
      };
    }
    return null;
  }

  function tokenizeText(text, indexes) {
    var normalizedText = normalizeUnicode(text);
    var result = [];
    var previousEnd = 0;
    WORD_RE.lastIndex = 0;
    var match;
    while ((match = WORD_RE.exec(normalizedText))) {
      var normalized = normalizeTerm(match[0]);
      if (normalized.endsWith(".") && !indexes.periodTerms.has(normalized)) {
        normalized = normalized.slice(0, -1);
      }
      if (normalized) {
        result.push({
          raw: match[0],
          normalized: normalized,
          index: match.index,
          separator_before: result.length ? normalizedText.slice(previousEnd, match.index) : ""
        });
        previousEnd = match.index + match[0].length;
      }
    }
    return result;
  }

  function cleanLabel(label) {
    return normalizeUnicode(label).trim()
      .replace(/^[#*_\-\s]+/, "")
      .replace(/[*_#\s]+$/, "")
      .replace(/^[【\[(（]\s*/, "")
      .replace(/\s*[】\])）]$/, "")
      .trim();
  }

  function isFieldLabel(label) {
    var normalized = normalizeTerm(cleanLabel(label));
    return FIELD_PREFIXES.some(function (prefix) {
      var item = normalizeTerm(prefix);
      return normalized === item || [" ", "(", "（", "-", "_", "/"].some(function (separator) {
        return normalized.startsWith(item + separator);
      });
    });
  }

  function classifyExplicitLabel(label) {
    var cleaned = cleanLabel(label);
    var types = Object.keys(SEGMENT_LABELS);
    for (var index = 0; index < types.length; index += 1) {
      if (SEGMENT_LABELS[types[index]].test(cleaned)) {
        return types[index];
      }
    }
    return "";
  }

  function isSpeakerLabel(label) {
    return /^(?:角色|人物)\s*[-_ ]?\s*(?:[A-Za-z0-9]|[甲乙丙丁一二三四五六七八九十]){1,8}$/i
      .test(cleanLabel(label));
  }

  function quotedEnglish(text) {
    var parts = [];
    var quotePattern = /“([^”]+)”|"([^"]+)"|「([^」]+)」|『([^』]+)』/g;
    var match;
    while ((match = quotePattern.exec(text))) {
      var value = match[1] || match[2] || match[3] || match[4] || "";
      if (ENGLISH_RE.test(value)) {
        parts.push(value.trim());
      }
    }
    return parts.join(" ");
  }

  function learnerText(value) {
    var quoted = quotedEnglish(value);
    if (quoted) {
      return quoted;
    }
    return toString(value)
      .replace(/[（(]([^（）()]*)[）)]/g, function (whole, inside) {
        return ENGLISH_RE.test(inside) ? " " + inside + " " : " ";
      })
      .replace(/^\s*[-—–]+\s*/, "")
      .trim();
  }

  function bilingualTitleInfo(value) {
    var title = normalizeUnicode(value)
      .replace(/^[#*\-\s]+/, "")
      .replace(/^.*?《/, "")
      .replace(/》.*$/, "")
      .trim();
    var match = title.match(/^(.+?)\s*\(\s*(.+?)\s*\)$/);
    var english = match ? match[1].trim() : "";
    var chinese = match ? match[2].trim() : "";
    return {
      valid: Boolean(match && ENGLISH_RE.test(english) && !CJK_RE.test(english) && CJK_RE.test(chinese)),
      english: english,
      chinese: chinese,
      full: title
    };
  }

  function englishTitle(value) {
    var title = toString(value)
      .replace(/^[#*\-\s]+/, "")
      .replace(/^.*?《/, "")
      .replace(/》.*$/, "")
      .trim();
    title = title.split(/[（(]/)[0].trim();
    return ENGLISH_RE.test(title) ? title : "";
  }

  function headerInfo(line) {
    var match = toString(line).match(
      /^\s*#{0,6}\s*剧本\s*0?(\d{1,2})\s*[：:]\s*(?:《([^》]+)》|(.+?))\s*$/
    );
    if (!match) {
      return null;
    }
    var fullTitle = (match[2] || match[3] || "").trim();
    var bilingual = bilingualTitleInfo(fullTitle);
    return {
      story_no: padStoryNo(match[1]),
      title: fullTitle,
      english_title: englishTitle(fullTitle),
      bilingual_title: bilingual
    };
  }

  function normalizeScript(script, index) {
    var object = script && typeof script === "object" ? script : {};
    var text = typeof script === "string"
      ? script
      : toString(object.text || object.content || object.script_text || object.script);
    var storyNo = padStoryNo(object.storyNo || object.story_no || object.no);
    var title = toString(object.title);
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      var header = headerInfo(lines[lineIndex]);
      if (header) {
        storyNo = storyNo || header.story_no;
        title = title || header.title;
        break;
      }
    }
    return {
      text: text,
      story_no: storyNo || padStoryNo(index + 1),
      title: title
    };
  }

  function extractLearnerSegments(script) {
    var normalizedScript = normalizeScript(script, 0);
    var lines = normalizedScript.text.replace(/\r\n?/g, "\n").split("\n");
    var segments = [];
    var warnings = [];
    var headerTitleSeen = false;
    var headerFullTitle = "";
    var storyTitleFull = "";
    var extractionErrors = [];
    var skippingLightweightFinalCheck = false;

    function pushSegment(type, text, lineNumber, sourceLine) {
      var cleaned = toString(text).trim();
      if (!cleaned || !ENGLISH_RE.test(cleaned)) {
        return;
      }
      var key = type + "|" + lineNumber + "|" + normalizeTerm(cleaned);
      if (segments.some(function (item) { return item.key === key; })) {
        return;
      }
      segments.push({
        key: key,
        type: type,
        text: cleaned,
        line_number: lineNumber,
        source_line: toString(sourceLine)
      });
    }

    lines.forEach(function (line, zeroIndex) {
      var lineNumber = zeroIndex + 1;
      var trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      var header = headerInfo(line);
      if (header) {
        skippingLightweightFinalCheck = false;
        normalizedScript.story_no = normalizedScript.story_no || header.story_no;
        normalizedScript.title = normalizedScript.title || header.title;
        headerFullTitle = header.title;
        pushSegment("title", header.title, lineNumber, line);
        headerTitleSeen = true;
        if (!header.bilingual_title.valid) {
          extractionErrors.push("正式剧本标题必须使用English Title（中文标题），且英文标题在前、中文标题在括号内。");
        }
        return;
      }

      if (LIGHTWEIGHT_FINAL_CHECK_RE.test(trimmed)) {
        skippingLightweightFinalCheck = true;
        return;
      }
      if (skippingLightweightFinalCheck) {
        return;
      }
      var colonMatch = trimmed.match(/^(.{1,80}?)[：:]\s*(.*)$/);
      if (colonMatch) {
        var label = colonMatch[1].trim();
        var remainder = colonMatch[2].trim();
        var explicitType = classifyExplicitLabel(label);
        if (explicitType) {
          pushSegment(explicitType, learnerText(remainder), lineNumber, line);
          return;
        }
        if (/^story_title$/i.test(label)) {
          storyTitleFull = remainder.replace(/^《|》$/g, "").trim();
          pushSegment("title", storyTitleFull, lineNumber, line);
          if (!bilingualTitleInfo(storyTitleFull).valid) {
            extractionErrors.push("story_title必须使用English Title（中文标题）的严格双语格式。");
          }
          return;
        }
        if (ENGLISH_RE.test(remainder) &&
            /(?:画面|屏幕|牌子|标牌|招牌|门牌|文字|写着|显示|出现英文)/.test(label + " " + remainder)) {
          pushSegment("on_screen_text", learnerText(remainder), lineNumber, line);
          return;
        }
        if (isSpeakerLabel(label) && ENGLISH_RE.test(remainder)) {
          pushSegment("dialogue", learnerText(remainder), lineNumber, line);
          return;
        }
        if (isFieldLabel(label)) {
          return;
        }
        var speakerLike = label.length <= 32 &&
          !/^[#【\[\(（]/.test(label) &&
          !/^\d/.test(label) &&
          ENGLISH_RE.test(remainder);
        if (speakerLike) {
          pushSegment("dialogue", learnerText(remainder), lineNumber, line);
          return;
        }
      }

      if (!isFieldLabel(trimmed)) {
        var quoteText = quotedEnglish(trimmed);
        if (quoteText) {
          pushSegment("dialogue", quoteText, lineNumber, line);
        }
      }
    });

    if (!headerTitleSeen && normalizedScript.title) {
      headerFullTitle = normalizedScript.title;
      pushSegment("title", normalizedScript.title, 1, normalizedScript.title);
      if (!bilingualTitleInfo(normalizedScript.title).valid) {
        extractionErrors.push("正式剧本标题必须使用English Title（中文标题），且英文标题在前、中文标题在括号内。");
      }
    } else if (!headerTitleSeen && !normalizedScript.title) {
      extractionErrors.push("缺少正式剧本双语标题English Title（中文标题）。");
    }
    if (headerFullTitle && storyTitleFull) {
      var normalizedHeaderTitle = normalizeUnicode(headerFullTitle).replace(/^《|》$/g, "").trim().replace(/\s+/g, " ");
      var normalizedStoryTitle = normalizeUnicode(storyTitleFull).replace(/^《|》$/g, "").trim().replace(/\s+/g, " ");
      if (normalizedHeaderTitle !== normalizedStoryTitle) {
        extractionErrors.push("story_title必须与剧本标题使用同一份English Title（中文标题）。");
      }
    }
    if (!segments.length) {
      warnings.push("未识别到英文标题、对白、字幕、旁白或画面内英文。");
    }
    segments.forEach(function (segment) { delete segment.key; });
    return {
      story_no: normalizedScript.story_no,
      title: normalizedScript.title,
      text: normalizedScript.text,
      segments: segments,
      errors: extractionErrors,
      warnings: warnings
    };
  }

  function splitCombinedScripts(text) {
    var source = toString(text).replace(/\r\n?/g, "\n");
    var marker = /^\s*#{0,6}\s*剧本\s*0?\d{1,2}\s*[：:]/gm;
    var starts = [];
    var match;
    while ((match = marker.exec(source))) {
      starts.push(match.index);
    }
    if (starts.length <= 1) {
      return [source];
    }
    return starts.map(function (start, index) {
      return source.slice(start, index + 1 < starts.length ? starts[index + 1] : source.length).trim();
    });
  }

  function contextErrors(context, data) {
    var errors = validateDataShape(data);
    if (!context || typeof context !== "object") {
      errors.push("缺少vocabulary-context-v1上下文。");
      return errors;
    }
    if (context.schema_version !== CONTEXT_SCHEMA) {
      errors.push("词汇上下文schema_version必须为" + CONTEXT_SCHEMA + "。");
    }
    if (context.valid !== true) {
      errors.push("词汇上下文未处于有效状态。");
      if (Array.isArray(context.errors)) {
        errors = errors.concat(context.errors);
      }
    }
    if (context.mode !== "short" && context.mode !== "long") {
      errors.push("词汇上下文mode无效。");
    }
    if (context.vocab_level !== "basic" && context.vocab_level !== "advanced") {
      errors.push("词汇上下文vocab_level无效。");
    }
    if (!Array.isArray(context.target_words) || context.target_words.length !== 4) {
      errors.push("词汇上下文必须包含恰好4个目标词。");
    } else {
      var seenTargets = new Set();
      context.target_words.forEach(function (target) {
        var surface = target && typeof target === "object" ? toString(target.word) : toString(target);
        var normalized = normalizeTerm(surface);
        if (!normalized) {
          errors.push("词汇上下文的目标词不能包含空值或无效内容。");
        } else if (seenTargets.has(normalized)) {
          errors.push("词汇上下文的4个目标词必须互不重复：" + surface + "。");
        }
        if (target && typeof target === "object" && target.normalized &&
            normalizeTerm(target.normalized) !== normalized) {
          errors.push("词汇上下文目标词的normalized字段与原始词不一致：" + surface + "。");
        }
        seenTargets.add(normalized);
      });
    }
    var dataBasicMax = Number(data && data.basic && data.basic.max_rank);
    var dataAdvancedMax = Number(data && data.advanced && data.advanced.max_group);
    if (
      context.vocab_level === "basic" &&
      (!Number.isInteger(context.basic_rank_max) ||
        context.basic_rank_max < 0 ||
        context.basic_rank_max > dataBasicMax)
    ) {
      errors.push("基础词汇上下文的basic_rank_max超出有效范围。");
    }
    if (context.vocab_level === "advanced") {
      if (
        !Number.isInteger(context.advanced_group_id) ||
        context.advanced_group_id < 1 ||
        context.advanced_group_id > dataAdvancedMax
      ) {
        errors.push("高级词汇上下文的advanced_group_id超出有效范围。");
      }
      if (context.basic_rank_max !== dataBasicMax) {
        errors.push("高级词汇上下文必须包含全部基础词。");
      }
    }
    if (toString(context.source_fingerprint) !== toString(data && data.source_fingerprint)) {
      errors.push("词汇上下文使用的词表版本与当前离线词表不一致。");
    }
    if (!context.task_fingerprint) {
      errors.push("词汇上下文缺少task_fingerprint。");
    } else if (context.task_fingerprint !== fingerprintContext(context)) {
      errors.push("词汇上下文任务指纹无效，目标词或范围可能已经变化。");
    }
    return Array.from(new Set(errors));
  }

  function makeViolation(segment, token, status, storyNo) {
    return {
      story_no: storyNo,
      segment_type: segment.type,
      line_number: segment.line_number,
      word: token.raw,
      normalized_word: token.normalized,
      reason_code: status.reason_code,
      reason: status.reason,
      context: segment.text,
      source_line: segment.source_line,
      base_word: status.base_word || ""
    };
  }

  function scanSegment(segment, storyNo, context, indexes, targets) {
    var tokens = tokenizeText(segment.text, indexes);
    var violations = [];
    var checkedCount = 0;
    var allowedCount = 0;
    var maxPhrase = Math.max(indexes.maxPhraseLength, targets.maxPhraseLength);

    for (var index = 0; index < tokens.length;) {
      var phrase = null;
      var phraseLength = Math.min(maxPhrase, tokens.length - index);
      for (var length = phraseLength; length >= 2; length -= 1) {
        var phraseHasOnlySpaces = true;
        for (var separatorIndex = index + 1; separatorIndex < index + length; separatorIndex += 1) {
          if (!/^\s+$/.test(tokens[separatorIndex].separator_before || "")) {
            phraseHasOnlySpaces = false;
            break;
          }
        }
        if (!phraseHasOnlySpaces) {
          continue;
        }
        var key = tokens.slice(index, index + length).map(function (item) {
          return item.normalized;
        }).join(" ");
        if (indexes.knownTerms.has(key) || targets.terms.has(key)) {
          phrase = {
            raw: tokens.slice(index, index + length).map(function (item) {
              return item.raw;
            }).join(" "),
            normalized: key,
            length: length
          };
          break;
        }
      }

      var current = phrase || {
        raw: tokens[index].raw,
        normalized: tokens[index].normalized,
        length: 1
      };
      checkedCount += 1;
      var status = exactStatus(current.normalized, context, indexes, targets);
      if (status) {
        var currentTargetInflections = targets.inflections.get(current.normalized) || [];
        if (status.allowed || currentTargetInflections.length) {
          allowedCount += 1;
        } else {
          violations.push(makeViolation(segment, current, status, storyNo));
        }
        index += current.length;
        continue;
      }

      var candidates = (indexes.inflectionMap.get(current.normalized) || [])
        .concat(targets.inflections.get(current.normalized) || []);
      var allowedCandidate = null;
      var blockedCandidate = null;
      candidates.some(function (candidate) {
        var baseStatus = exactStatus(candidate.base, context, indexes, targets);
        if (baseStatus && baseStatus.allowed) {
          allowedCandidate = candidate;
          return true;
        }
        if (baseStatus && !blockedCandidate) {
          blockedCandidate = candidate;
        }
        return false;
      });
      if (allowedCandidate) {
        allowedCount += 1;
        index += current.length;
        continue;
      }

      var missingStatus;
      if (blockedCandidate) {
        missingStatus = {
          reason_code: "INFLECTION_BASE_NOT_ALLOWED",
          reason: "该词形只能追溯到当前范围外的基础词" +
            blockedCandidate.base_word + "，不能借词形变化越级使用。",
          base_word: blockedCandidate.base_word
        };
      } else if (/(?:'s|s')$/.test(current.normalized)) {
        missingStatus = {
          reason_code: "POSSESSIVE_NOT_ALLOWED",
          reason: "该所有格形式未作为独立词收录，系统不会自动放行所有格。"
        };
      } else if (current.normalized.indexOf("'") >= 0) {
        missingStatus = {
          reason_code: "CONTRACTION_NOT_ALLOWED",
          reason: "该缩写形式未作为独立词收录，系统不会自动展开或放行缩写。"
        };
      } else {
        missingStatus = {
          reason_code: "NOT_IN_WHITELIST",
          reason: "该词不在当前可用白名单中。"
        };
      }
      violations.push(makeViolation(segment, current, missingStatus, storyNo));
      index += current.length;
    }

    return {
      checked_count: checkedCount,
      allowed_count: allowedCount,
      violations: violations
    };
  }

  function validateScripts(scripts, context, data) {
    var errors = contextErrors(context, data);
    var taskFingerprint = context && fingerprintContext(context);
    var inputScripts;
    if (typeof scripts === "string") {
      inputScripts = splitCombinedScripts(scripts);
    } else if (Array.isArray(scripts)) {
      inputScripts = scripts;
    } else if (scripts) {
      inputScripts = [scripts];
    } else {
      inputScripts = [];
    }
    if (!inputScripts.length) {
      errors.push("没有可校验的剧本。");
    }

    var report = {
      valid: false,
      task_fingerprint: taskFingerprint || "",
      errors: Array.from(new Set(errors)),
      scripts: [],
      violations: [],
      summary: {
        script_count: inputScripts.length,
        valid_script_count: 0,
        invalid_script_count: 0,
        segment_count: 0,
        checked_word_count: 0,
        allowed_word_count: 0,
        violation_count: 0
      }
    };
    if (report.errors.length) {
      return report;
    }

    var indexes = createIndexes(data);
    var targets = targetIndex(context);
    inputScripts.forEach(function (script, scriptIndex) {
      var extracted = extractLearnerSegments(script);
      var scriptErrors = Array.isArray(extracted.errors) ? extracted.errors.slice() : [];
      var scriptViolations = [];
      var checkedCount = 0;
      var allowedCount = 0;
      if (!extracted.segments.length) {
        scriptErrors.push("未识别到可校验的学习者英文内容。");
      }
      extracted.segments.forEach(function (segment) {
        var segmentReport = scanSegment(
          segment, extracted.story_no || padStoryNo(scriptIndex + 1),
          context, indexes, targets
        );
        checkedCount += segmentReport.checked_count;
        allowedCount += segmentReport.allowed_count;
        scriptViolations = scriptViolations.concat(segmentReport.violations);
      });
      var valid = !scriptErrors.length && !scriptViolations.length;
      var scriptReport = {
        story_no: extracted.story_no || padStoryNo(scriptIndex + 1),
        title: extracted.title,
        valid: valid,
        errors: scriptErrors,
        warnings: extracted.warnings,
        segments: extracted.segments,
        violations: scriptViolations,
        summary: {
          segment_count: extracted.segments.length,
          checked_word_count: checkedCount,
          allowed_word_count: allowedCount,
          violation_count: scriptViolations.length
        }
      };
      report.scripts.push(scriptReport);
      report.violations = report.violations.concat(scriptViolations);
      report.summary.segment_count += extracted.segments.length;
      report.summary.checked_word_count += checkedCount;
      report.summary.allowed_word_count += allowedCount;
      report.summary.violation_count += scriptViolations.length;
      if (valid) {
        report.summary.valid_script_count += 1;
      } else {
        report.summary.invalid_script_count += 1;
      }
    });
    report.valid = report.summary.invalid_script_count === 0;
    return report;
  }

  function scriptText(script) {
    if (typeof script === "string") {
      return script;
    }
    return toString(
      script && (script.text || script.content || script.script_text || script.script)
    );
  }

  function termIsAllowed(term, context, indexes, targets) {
    var normalized = normalizeTerm(term);
    if (!normalized) {
      return false;
    }
    var exact = exactStatus(normalized, context, indexes, targets);
    if (exact) {
      return exact.allowed || (targets.inflections.get(normalized) || []).length > 0;
    }
    return (indexes.inflectionMap.get(normalized) || [])
      .concat(targets.inflections.get(normalized) || [])
      .some(function (candidate) {
        var baseStatus = exactStatus(candidate.base, context, indexes, targets);
        return Boolean(baseStatus && baseStatus.allowed);
      });
  }

  function buildAllowedVocabularyContext(context, data) {
    var errors = contextErrors(context, data);
    var emptyCounts = {
      basic_word_count: 0,
      generated_form_count: 0,
      learned_advanced_word_count: 0,
      target_word_count: 0,
      effective_allowed_word_count: 0
    };
    if (errors.length) {
      return {
        valid: false,
        errors: errors,
        range_text: "",
        basic_words: [],
        generated_forms: [],
        learned_advanced_words: [],
        target_words: [],
        allowed_words: [],
        allowed_vocabulary_text: "",
        counts: emptyCounts
      };
    }

    var indexes = createIndexes(data);
    var targets = targetIndex(context);
    var seen = new Set();
    var basicWords = [];
    var basicGeneratedForms = [];
    var learnedAdvancedWords = [];
    var targetOriginals = [];
    var targetGeneratedForms = [];
    var targetWords = (context.target_words || []).map(function (item) {
      return normalizeTerm(item.normalized || item.word);
    }).filter(Boolean);
    var eligibleBasicEntries = (data.basic.entries || []).slice()
      .sort(function (left, right) {
        return Number(left.rank) - Number(right.rank);
      }).filter(function (entry) {
        return context.vocab_level === "advanced" ||
          Number(entry.rank) <= context.basic_rank_max;
      });

    function addAllowed(bucket, value) {
      var normalized = normalizeTerm(value);
      if (!normalized || seen.has(normalized) ||
          !termIsAllowed(normalized, context, indexes, targets)) {
        return;
      }
      seen.add(normalized);
      bucket.push(normalized);
    }

    eligibleBasicEntries.forEach(function (entry) {
      addAllowed(basicWords, entry.word);
    });
    eligibleBasicEntries.forEach(function (entry) {
      generateInflections(entry.word, entry.pos).forEach(function (form) {
        addAllowed(basicGeneratedForms, form.form);
      });
    });

    if (context.vocab_level === "advanced") {
      (data.advanced.groups || []).slice().sort(function (left, right) {
        return Number(left.group_id) - Number(right.group_id);
      }).forEach(function (group) {
        if (Number(group.group_id) >= context.advanced_group_id) {
          return;
        }
        (group.words || []).forEach(function (word) {
          addAllowed(learnedAdvancedWords, word);
        });
      });
    }

    (context.target_words || []).forEach(function (item) {
      addAllowed(targetOriginals, item.normalized || item.word);
    });
    (context.target_words || []).forEach(function (item) {
      generateInflections(item.normalized || item.word, item.pos).forEach(function (form) {
        addAllowed(targetGeneratedForms, form.form);
      });
    });

    var generatedForms = basicGeneratedForms.concat(targetGeneratedForms);
    var allowedWords = basicWords.concat(
      basicGeneratedForms,
      learnedAdvancedWords,
      targetOriginals,
      targetGeneratedForms
    );
    var rangeText = context.vocab_level === "advanced"
      ? "全部基础词（basic_order_rank<=" + context.basic_rank_max +
        "）+高级Group 1-" + Math.max(0, context.advanced_group_id - 1)
      : "basic_order_rank<=" + context.basic_rank_max;

    return {
      valid: true,
      errors: [],
      range_text: rangeText,
      basic_words: basicWords,
      generated_forms: generatedForms,
      learned_advanced_words: learnedAdvancedWords,
      target_words: targetWords,
      allowed_words: allowedWords,
      allowed_vocabulary_text: allowedWords.join(","),
      counts: {
        basic_word_count: basicWords.length,
        generated_form_count: generatedForms.length,
        learned_advanced_word_count: learnedAdvancedWords.length,
        target_word_count: targetWords.length,
        effective_allowed_word_count: allowedWords.length
      }
    };
  }

  function buildRepairPrompt(script, violations, context, scriptErrors, data) {
    var list = Array.isArray(violations) ? violations : [];
    var structuralErrors = Array.isArray(scriptErrors) ? scriptErrors : [];
    var allowedContext = buildAllowedVocabularyContext(context, data);
    if (!allowedContext.valid) {
      throw new Error(
        "无法生成Allowed Vocabulary Context：" + allowedContext.errors.join("；")
      );
    }
    var seen = new Set();
    var lines = [];
    var segmentLabels = {
      title: "英文标题",
      dialogue: "角色英文对白",
      subtitle: "字幕",
      narration: "旁白",
      on_screen_text: "画面内英文"
    };
    list.forEach(function (item) {
      var key = [
        item.segment_type, item.line_number, item.normalized_word,
        item.source_line || item.context
      ].join("|");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lines.push([
        "word: " + item.word,
        "location: 第" + item.line_number + "行 / " +
          (segmentLabels[item.segment_type] || item.segment_type),
        "sentence: " + toString(item.source_line || item.context).trim()
      ].join("\n"));
    });
    var structuralSection = structuralErrors.length ? [
      "## 同时存在的格式问题",
      structuralErrors.map(function (message) {
        return "- " + message;
      }).join("\n")
    ].join("\n") : null;
    var counts = allowedContext.counts;
    var promptLines = [
      "# 白名单违规返修Prompt",
      "",
      "你只负责修正当前正式剧本中的白名单违规英文。不要读取Excel，不要自行判断词汇难度，也不要调用历史任务词汇。",
      "",
      "## 原始违规剧本",
      "===== 原剧本开始 =====",
      scriptText(script),
      "===== 原剧本结束 =====",
      "",
      "## 违规词列表",
      lines.join("\n\n") || "无词汇违规项。",
      structuralSection,
      "",
      "## Vocabulary Context",
      "当前白名单规则：由本地检测程序生成，GPT不得重新解释或扩展。",
      "允许基础词范围：" + allowedContext.range_text,
      "额外允许学习台词目标词：" + allowedContext.target_words.join(","),
      "允许基础词数量：" + counts.basic_word_count,
      "允许规则词形数量：" + counts.generated_form_count,
      context.vocab_level === "advanced"
        ? "允许已学高级词数量：" + counts.learned_advanced_word_count
        : null,
      "有效允许词总数：" + counts.effective_allowed_word_count,
      "完整Allowed Vocabulary：",
      allowedContext.allowed_vocabulary_text,
      "",
      "## 白名单自然改写原则",
      "返修目标：在满足白名单限制的前提下，生成自然、适合儿童动画对白的英语。",
      "修改优先级：",
      "1. 必须通过Allowed Vocabulary检测。",
      "2. 保持儿童英语自然表达。",
      "3. 保持原句核心意思。",
      "4. 尽量保持原句结构和表达丰富度。",
      "禁止为了通过白名单，把句子改成单词堆叠、电报式表达、缺少主谓结构或不符合儿童口语习惯的短语。",
      "",
      "## 语义保持与降维规则",
      "违规词可以直接替换时，优先进行最小词语替换。例如：looks funny → is funny。",
      "违规词无法直接替换时，允许在不改变核心意思的前提下重新组织句子。",
      "例如：Small things are good. 不得改成 Small good.；可以改成 Small is good. 或其他自然的白名单表达。",
      "",
      "## 降维限制",
      "仅当违规词无法直接替换、保持原表达会新增超纲词，或复杂表达不符合当前儿童英语水平时，才允许降低表达复杂度。",
      "降维时不得主动删除句子结构、角色交流、情绪表达或自然口语。",
      "",
      "## 返修方向",
      "依次优先采用：词替换 → 短语替换 → 句式重组。",
      "不得采用删除大量信息的方式通过白名单。",
      "",
      "## 儿童动画对白检查",
      "修改后逐句检查：",
      "1. 这句话是否像当前角色会说的话？",
      "2. 儿童听到后是否容易理解？",
      "3. 是否仍然保持动画对白的自然感？",
      "如果只是白名单合规但对白明显机械，必须继续优化。",
      "",
      "## 修改边界",
      "1. 只修改“违规词列表”对应的英文表达，已经合规的英文保持不变。",
      "2. 禁止新增任何不在完整Allowed Vocabulary中的英文词或词形。",
      "3. 不改变故事、角色、角色关系、剧情、关键动作、核心反转、中文标题、学习台词目标词和原台词核心意思。",
      "4. 不删除学习台词目标词，不用其他英文词替代学习台词目标词。",
      "5. 修改后，英文标题、对白、字幕、旁白和画面内英文必须再次通过同一白名单检测。",
      "6. 如果无法在白名单内自然保留该句核心意思，只返回：白名单表达不可行，需要重新设计该句。",
      "",
      "## 输出结构",
      "只返回修正后的这一部完整剧本。",
      "禁止输出分析、修改原因、替换列表、词汇解释、白名单或Markdown代码围栏。",
      "除规定的不可行提示外，不得输出完整剧本以外的任何文字。",
      "",
      "## 任务锁定",
      "task_fingerprint: " + toString(context && context.task_fingerprint),
      "source_fingerprint: " + toString(context && context.source_fingerprint)
    ];
    return promptLines.filter(function (line) {
      return line !== null;
    }).join("\n");
  }
  return {
    DATA_SCHEMA: DATA_SCHEMA,
    CONTEXT_SCHEMA: CONTEXT_SCHEMA,
    normalizeTerm: normalizeTerm,
    parseWordSelection: parseWordSelection,
    buildVocabularyContext: buildVocabularyContext,
    fingerprintContext: fingerprintContext,
    extractLearnerSegments: extractLearnerSegments,
    validateScripts: validateScripts,
    buildAllowedVocabularyContext: buildAllowedVocabularyContext,
    buildRepairPrompt: buildRepairPrompt
  };
});
