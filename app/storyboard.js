(function (root) {
  "use strict";

  var SCHEMA_VERSION = "storyboard-package-v1";
  var DRAFT_SCHEMA_VERSION = "storyboard-draft-v2";
  var PROMPT_SAFETY_MARKER = "## 精简分镜JSON输出协议（最高优先级）";
  var PROMPT_ROOT_CLOSE_MARKER = "顶层对象闭合后禁止继续输出任何 ]、}";
  var STORAGE_PREFIX = "storyboard_tool_v1_";
  var VOCABULARY_CONTEXT_STORAGE_PREFIX = "vocabulary_context_v1_";
  var REPAIR_TOLERANCE = 0.01;
  var DB_NAME = "storyboard_sketches_v1";
  var DB_STORE = "sketches";
  var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  var EPSILON = 0.000001;

  function normalizeMode(value) {
    return String(value || "").toLowerCase() === "long" ? "long" : "short";
  }

  function normalizeStoryNo(value) {
    var text = String(value == null ? "" : value)
      .replace(/[０-９]/g, function (digit) {
        return String("０１２３４５６７８９".indexOf(digit));
      })
      .trim();
    var match = text.match(/\d{1,2}/);
    if (!match) return "";
    var number = Number(match[0]);
    return number >= 1 && number <= 6 ? String(number).padStart(2, "0") : "";
  }

  function modePolicy(mode) {
    mode = normalizeMode(mode);
    if (mode === "long") {
      return {
        mode: "long",
        durationText: "总时长不得少于90秒",
        autoText: "自动模式至少10个Cut，并按时长和主要视觉变化继续增加",
        cutOptions: [
          { value: "auto", label: "自动（至少10个Cut）" },
          { value: "10", label: "固定10个Cut" },
          { value: "12", label: "固定12个Cut" },
          { value: "15", label: "固定15个Cut" }
        ],
        defaultCutPolicy: "auto"
      };
    }
    return {
      mode: "short",
      durationText: "总时长30—90秒",
      autoText: "自动模式使用6—8个Cut",
      cutOptions: [
        { value: "auto", label: "自动（6—8个Cut）" },
        { value: "6", label: "固定6个Cut" },
        { value: "7", label: "固定7个Cut" },
        { value: "8", label: "固定8个Cut" }
      ],
      defaultCutPolicy: "auto"
    };
  }

  function defaultSettings(mode) {
    return {
      aspectRatio: "16:9",
      cutPolicy: modePolicy(mode).defaultCutPolicy,
      sketchStyle: "黑白铅笔线稿，清楚构图，简洁表情与动作线",
      animationStyle: "明亮、柔和、适合3-10岁儿童的卡通动画",
      sceneStyle: "造型简洁、色彩清楚、道具位置易辨认",
      extraLimits: ""
    };
  }

  function textHash(value) {
    var text = String(value || "");
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  function extractTitle(heading, storyNo) {
    var bookTitle = String(heading || "").match(/《\s*([^》\r\n]+?)\s*》/);
    if (bookTitle) return bookTitle[1].trim();
    var afterColon = String(heading || "").split(/[：:]/).slice(1).join(":").trim();
    if (afterColon) return afterColon.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "");
    return "剧本" + storyNo;
  }

  function splitScripts(rawText) {
    var text = String(rawText || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    var headingPattern = /^(?:[ \t]*#{1,6}[ \t]*)?(?:正式[ \t]*)?(?:剧本|脚本|故事)[ \t]*([0-9０-９]{1,2})[ \t]*(?:[：:、.\-]|(?=[ \t]*$))[^\n]*$/gmi;
    var matches = [];
    var match;
    while ((match = headingPattern.exec(text))) {
      matches.push({
        index: match.index,
        heading: match[0].trim(),
        storyNo: normalizeStoryNo(match[1])
      });
    }
    var byNo = {};
    var duplicates = [];
    var warnings = [];
    matches.forEach(function (item, index) {
      if (!item.storyNo) {
        warnings.push("无法识别标题中的剧本编号：" + item.heading);
        return;
      }
      var end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      var entry = {
        storyNo: item.storyNo,
        title: extractTitle(item.heading, item.storyNo),
        text: text.slice(item.index, end).trim(),
        heading: item.heading,
        status: "recognized"
      };
      if (byNo[item.storyNo]) duplicates.push(item.storyNo);
      else byNo[item.storyNo] = entry;
      var standardPattern = new RegExp("^(?:#{1,6}\\s*)?剧本" + item.storyNo + "：\\s*《[^》]+》");
      if (!standardPattern.test(item.heading)) {
        warnings.push("剧本" + item.storyNo + "标题不是推荐格式“# 剧本" + item.storyNo + "：《标题》”，但已尝试识别。");
      }
    });
    var scripts = [];
    var missing = [];
    for (var n = 1; n <= 6; n += 1) {
      var no = String(n).padStart(2, "0");
      if (byNo[no]) scripts.push(byNo[no]);
      else {
        missing.push(no);
        scripts.push({ storyNo: no, title: "未识别", text: "", heading: "", status: "missing" });
      }
    }
    duplicates = duplicates.filter(function (value, index, array) {
      return array.indexOf(value) === index;
    });
    if (text.trim() && matches.length === 0) {
      warnings.push("没有找到可识别的剧本标题。请使用“# 剧本01：《标题》”至“# 剧本06：《标题》”。");
    }
    scripts.forEach(function (script) {
      if (String(script.text || "").length > 50000) {
        warnings.push("剧本" + script.storyNo + "内容较长，生成Prompt后可能被模型截断，建议确认。");
      }
    });
    if (text.length > 250000) {
      warnings.push("本次总输入超过250,000字符，可能超出浏览器本地保存空间或模型上下文，建议分批备份并确认。");
    }
    return {
      ok: missing.length === 0 && duplicates.length === 0,
      scripts: scripts,
      missing: missing,
      duplicates: duplicates,
      warnings: warnings,
      headingCount: matches.length
    };
  }

  function stripJsonFences(value) {
    var text = String(value || "").replace(/^\uFEFF/, "").trim();
    var fence = text.match(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i);
    return fence ? fence[1].trim() : text;
  }

  function describeJsonParseError(rawText, error) {
    var message = error && error.message ? error.message : String(error || "未知JSON错误");
    var details = ["JSON解析失败：" + message];
    var text = String(rawText || "");
    var positionMatch = message.match(/position\s+(\d+)/i);
    var columnMatch = message.match(/line\s+1\s+column\s+(\d+)/i);
    var position = positionMatch ? Number(positionMatch[1]) :
      (columnMatch ? Math.max(0, Number(columnMatch[1]) - 1) : NaN);
    if (Number.isFinite(position)) {
      var start = Math.max(0, position - 55);
      var end = Math.min(text.length, position + 85);
      var before = text.slice(start, position).replace(/\s+/g, " ");
      var after = text.slice(position, end).replace(/\s+/g, " ");
      details.push("错误位置附近：" + (start > 0 ? "…" : "") + before + " ⟦此处⟧ " + after + (end < text.length ? "…" : ""));
    }
    details.push("常见原因：seedance_prompt等字符串值内部用未经转义的半角双引号包裹英文台词。新版安全Prompt已要求改用【原台词】。");
    return details;
  }

  function pushUnique(list, message) {
    if (message && list.indexOf(message) === -1) list.push(message);
  }

  function nextNonWhitespace(text, start) {
    for (var index = start; index < text.length; index += 1) {
      if (!/\s/.test(text.charAt(index))) return text.charAt(index);
    }
    return "";
  }

  function extractJsonCandidate(value, repairs, errors) {
    var text = String(value || "").replace(/^\uFEFF/, "").trim();
    var fenced = text.match(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i);
    if (fenced) {
      text = fenced[1].trim();
      pushUnique(repairs, "已移除Markdown代码围栏。");
    }
    var halfFirst = text.indexOf("{");
    var fullFirst = text.indexOf("｛");
    var first = halfFirst < 0 ? fullFirst :
      (fullFirst < 0 ? halfFirst : Math.min(halfFirst, fullFirst));
    var last = Math.max(text.lastIndexOf("}"), text.lastIndexOf("｝"));
    if (first < 0) {
      errors.push("没有找到JSON对象的起始符号 {。");
      return "";
    }
    if (last < first) {
      errors.push("JSON没有完整结束符号 }，结果可能已被截断。");
      return "";
    }
    if (first > 0 || last < text.length - 1) {
      text = text.slice(first, last + 1);
      pushUnique(repairs, "已移除JSON前后的说明文字。");
    }
    return text;
  }

  function normalizeFullWidthStructure(text, repairs) {
    var map = {
      "｛": "{", "｝": "}", "［": "[", "］": "]",
      "：": ":", "，": ","
    };
    var output = "";
    var inString = false;
    var escaped = false;
    var changed = false;
    for (var index = 0; index < text.length; index += 1) {
      var character = text.charAt(index);
      if (inString) {
        output += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        output += character;
      } else if (map[character]) {
        output += map[character];
        changed = true;
      } else {
        output += character;
      }
    }
    if (changed) pushUnique(repairs, "已把JSON结构中的全角括号、冒号或逗号转换为半角符号。");
    return output;
  }

  function repairJsonSyntax(text, repairs, errors) {
    var output = "";
    var inString = false;
    var escaped = false;
    var fixedQuotes = false;
    var fixedControls = false;
    var fixedTrailingCommas = false;
    var fixedExtraClosers = false;
    var rootCompleted = false;
    var stack = [];

    for (var index = 0; index < text.length; index += 1) {
      var character = text.charAt(index);
      if (inString) {
        if (escaped) {
          output += character;
          escaped = false;
          continue;
        }
        if (character === "\\") {
          output += character;
          escaped = true;
          continue;
        }
        if (character === "\n" || character === "\r" || character === "\t") {
          output += character === "\t" ? "\\t" : "\\n";
          fixedControls = true;
          continue;
        }
        if (character === '"') {
          var next = nextNonWhitespace(text, index + 1);
          if (next === "" || next === ":" || next === "," || next === "}" || next === "]") {
            output += character;
            inString = false;
          } else {
            output += '\\"';
            fixedQuotes = true;
          }
          continue;
        }
        output += character;
        continue;
      }

      if (character === '"') {
        inString = true;
        output += character;
        continue;
      }
      if (character === ",") {
        var afterComma = nextNonWhitespace(text, index + 1);
        if (afterComma === "}" || afterComma === "]") {
          fixedTrailingCommas = true;
          continue;
        }
      }
      if (character === "{" || character === "[") stack.push(character);
      if (character === "}" || character === "]") {
        var expectedOpen = character === "}" ? "{" : "[";
        if (!stack.length || stack[stack.length - 1] !== expectedOpen) {
          var trailingClosers = !stack.length && rootCompleted &&
            /^[\]\}]+$/.test(text.slice(index).replace(/\s/g, ""));
          if (trailingClosers) {
            fixedExtraClosers = true;
            continue;
          }
          pushUnique(errors, "JSON括号顺序不匹配，无法安全自动修复。");
        } else {
          stack.pop();
          if (!stack.length) rootCompleted = true;
        }
      }
      output += character;
    }

    if (inString) pushUnique(errors, "JSON字符串没有闭合，结果可能已被截断。");
    if (stack.length) pushUnique(errors, "JSON对象或数组没有闭合，结果可能已被截断。");
    if (fixedQuotes) pushUnique(repairs, "已转义能够明确识别的字符串内部裸双引号。");
    if (fixedControls) pushUnique(repairs, "已转义JSON字符串中的非法换行或制表符。");
    if (fixedTrailingCommas) pushUnique(repairs, "已移除对象或数组末尾的尾随逗号。");
    if (fixedExtraClosers) pushUnique(repairs, "已移除完整JSON对象之后多余的闭合括号。");
    return output;
  }

  function safeRepairJson(value) {
    var repairs = [];
    var errors = [];
    var text = extractJsonCandidate(value, repairs, errors);
    if (!text) return { valid: false, text: "", value: null, repairs: repairs, errors: errors };
    text = normalizeFullWidthStructure(text, repairs);
    text = repairJsonSyntax(text, repairs, errors);
    if (errors.length) return { valid: false, text: text, value: null, repairs: repairs, errors: errors };
    try {
      return {
        valid: true,
        text: text,
        value: JSON.parse(text),
        repairs: repairs,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        text: text,
        value: null,
        repairs: repairs,
        errors: describeJsonParseError(text, error)
      };
    }
  }

  function isSafePrompt(value, context) {
    var text = String(value || "");
    var structurallySafe = text.indexOf(PROMPT_SAFETY_MARKER) !== -1 &&
      text.indexOf(PROMPT_ROOT_CLOSE_MARKER) !== -1;
    if (!structurallySafe || !context) return structurallySafe;
    return text.indexOf("- vocabulary_context_schema: " + context.schema_version) !== -1 &&
      text.indexOf("- task_fingerprint: " + context.task_fingerprint) !== -1 &&
      text.indexOf("- source_fingerprint: " + context.source_fingerprint) !== -1;
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function requiredString(object, key, path, errors, allowEmpty) {
    if (!object || typeof object[key] !== "string" || (!allowEmpty && !object[key].trim())) {
      errors.push(path + "." + key + " 必须是" + (allowEmpty ? "字符串" : "非空字符串") + "。");
      return false;
    }
    return true;
  }

  function parseFixedCutPolicy(mode, value) {
    var number = Number(value);
    var allowed = normalizeMode(mode) === "long" ? [10, 12, 15] : [6, 7, 8];
    return allowed.indexOf(number) >= 0 ? number : null;
  }

  function validatePackage(pkg, expected) {
    expected = expected || {};
    var expectedMode = normalizeMode(expected.mode);
    var expectedStoryNo = normalizeStoryNo(expected.storyNo);
    var cutPolicy = String(expected.cutPolicy || "auto");
    var errors = [];
    var warnings = [];

    if (!isPlainObject(pkg)) {
      return { valid: false, errors: ["根节点必须是JSON对象。"], warnings: [] };
    }
    if (pkg.schema_version !== SCHEMA_VERSION) {
      errors.push('schema_version 必须严格为 "' + SCHEMA_VERSION + '"。');
    }
    if (pkg.mode !== "short" && pkg.mode !== "long") {
      errors.push('mode 必须是 "short" 或 "long"。');
    } else if (expected.mode && pkg.mode !== expectedMode) {
      errors.push("模式不匹配：当前页面是 " + expectedMode + "，JSON是 " + pkg.mode + "。");
    }
    if (!Array.isArray(pkg.stories) || pkg.stories.length !== 1) {
      errors.push("stories 必须是且只能包含一个剧本的数组。");
      return { valid: false, errors: errors, warnings: warnings };
    }

    var story = pkg.stories[0];
    if (!isPlainObject(story)) {
      errors.push("stories[0] 必须是对象。");
      return { valid: false, errors: errors, warnings: warnings };
    }
    var actualNo = normalizeStoryNo(story.story_no);
    if (!actualNo || story.story_no !== actualNo) {
      errors.push("stories[0].story_no 必须是01—06的两位字符串。");
    } else if (expectedStoryNo && actualNo !== expectedStoryNo) {
      errors.push("剧本编号不匹配：当前选择剧本" + expectedStoryNo + "，JSON是剧本" + actualNo + "。");
    }
    requiredString(story, "title", "stories[0]", errors, false);
    if (story.status !== "ready" && story.status !== "return_to_script") {
      errors.push('stories[0].status 必须是 "ready" 或 "return_to_script"。');
    }
    if (!Array.isArray(story.shots)) {
      errors.push("stories[0].shots 必须是数组。");
    }

    if (story.status === "return_to_script") {
      requiredString(story, "return_reason", "stories[0]", errors, false);
      if (story.total_duration_sec !== 0) {
        errors.push("退回Step06时 total_duration_sec 必须为0。");
      }
      if (!Array.isArray(story.target_words) || story.target_words.some(function (word) { return typeof word !== "string"; })) {
        errors.push("退回Step06时 target_words 仍必须保留为字符串数组。");
      }
      ["visual_style", "character_continuity", "scene_prop_continuity", "core_twist"].forEach(function (key) {
        requiredString(story, key, "stories[0]", errors, true);
      });
      if (Array.isArray(story.shots) && story.shots.length !== 0) {
        errors.push("退回Step06时 shots 必须为空数组。");
      }
      return { valid: errors.length === 0, errors: errors, warnings: warnings, story: story };
    }

    requiredString(story, "return_reason", "stories[0]", errors, true);
    if (!isFiniteNumber(story.total_duration_sec)) {
      errors.push("stories[0].total_duration_sec 必须是数字。");
    } else {
      var packageMode = pkg.mode === "long" ? "long" : "short";
      if (packageMode === "short" && (story.total_duration_sec < 30 || story.total_duration_sec > 90)) {
        errors.push("短篇总时长必须在30—90秒之间。");
      }
      if (packageMode === "long" && story.total_duration_sec < 90) {
        errors.push("长篇总时长必须不少于90秒。");
      }
    }
    if (!Array.isArray(story.target_words) || story.target_words.some(function (word) { return typeof word !== "string"; })) {
      errors.push("stories[0].target_words 必须是字符串数组。");
    }
    ["visual_style", "character_continuity", "scene_prop_continuity", "core_twist"].forEach(function (key) {
      requiredString(story, key, "stories[0]", errors, false);
    });

    if (Array.isArray(story.shots)) {
      var count = story.shots.length;
      var checkMode = pkg.mode === "long" ? "long" : "short";
      var fixed = parseFixedCutPolicy(checkMode, cutPolicy);
      if (fixed !== null && count !== fixed) {
        errors.push("固定镜头数量要求为" + fixed + "个Cut，实际为" + count + "个。");
      } else if (fixed === null && checkMode === "short" && (count < 6 || count > 8)) {
        errors.push("短篇自动模式必须为6—8个Cut。");
      } else if (fixed === null && checkMode === "long" && count < 10) {
        errors.push("长篇自动模式必须至少10个Cut。");
      }

      var previousEnd = 0;
      story.shots.forEach(function (shot, index) {
        var path = "stories[0].shots[" + index + "]";
        if (!isPlainObject(shot)) {
          errors.push(path + " 必须是对象。");
          return;
        }
        requiredString(shot, "cut", path, errors, false);
        if (typeof shot.cut === "string" && shot.cut.trim() !== "Cut " + (index + 1)) {
          errors.push(path + ".cut 必须按顺序写为 Cut " + (index + 1) + "。");
        }
        if (!isFiniteNumber(shot.start_sec) || !isFiniteNumber(shot.end_sec)) {
          errors.push(path + " 的 start_sec 和 end_sec 必须是数字。");
        } else {
          if (shot.start_sec < 0 || shot.end_sec <= shot.start_sec) {
            errors.push(path + " 时间码必须满足 0 <= start_sec < end_sec。");
          }
          if (Math.abs(shot.start_sec - previousEnd) > EPSILON) {
            errors.push(path + ".start_sec 必须连续衔接上一镜end_sec（应为" + previousEnd + "）。");
          }
          previousEnd = shot.end_sec;
        }
        [
          "story_function", "sketch_prompt", "shot_size", "camera_move",
          "subject", "scene", "action_description", "sound", "seedance_prompt"
        ].forEach(function (key) {
          requiredString(shot, key, path, errors, false);
        });
        if (!Array.isArray(shot.dialogue)) {
          errors.push(path + ".dialogue 必须是数组，无台词时使用空数组。");
        } else {
          shot.dialogue.forEach(function (dialogue, dialogueIndex) {
            var dialoguePath = path + ".dialogue[" + dialogueIndex + "]";
            if (!isPlainObject(dialogue)) {
              errors.push(dialoguePath + " 必须是对象。");
              return;
            }
            ["speaker", "line", "subtitle"].forEach(function (key) {
              requiredString(dialogue, key, dialoguePath, errors, false);
            });
            if (typeof dialogue.line === "string" && typeof dialogue.subtitle === "string" &&
                dialogue.line !== dialogue.subtitle) {
              warnings.push(dialoguePath + " 的台词与字幕不一致；页面不会自动改写，请人工核对原剧本。");
            }
          });
        }
        if (!isPlainObject(shot.continuity)) {
          errors.push(path + ".continuity 必须是对象。");
        } else {
          ["start_state", "end_state", "next_connection"].forEach(function (key) {
            requiredString(shot.continuity, key, path + ".continuity", errors, false);
          });
        }
      });
      if (isFiniteNumber(story.total_duration_sec) && story.shots.length &&
          Math.abs(previousEnd - story.total_duration_sec) > EPSILON) {
        errors.push("最后一镜end_sec必须等于total_duration_sec（" + story.total_duration_sec + "）。");
      }
      if (story.shots.length && isFiniteNumber(story.shots[0].start_sec) &&
          Math.abs(story.shots[0].start_sec) > EPSILON) {
        errors.push("第一镜start_sec必须从0开始。");
      }
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings, story: story };
  }

  function validateStoryboardVocabulary(pkg, context, data, guardApi) {
    var guard = guardApi || root.VocabularyGuard;
    var errors = [];
    if (!guard || typeof guard.validateScripts !== "function") {
      return { valid: false, errors: ["故事板词汇复核组件不可用。"], report: null };
    }
    if (!data) {
      return { valid: false, errors: ["故事板词汇复核缺少离线词表数据。"], report: null };
    }
    var story = pkg && Array.isArray(pkg.stories) ? pkg.stories[0] : null;
    if (!story) {
      return { valid: false, errors: ["故事板缺少可复核的stories[0]。"], report: null };
    }
    if (story.status === "return_to_script") {
      return { valid: true, errors: [], report: null };
    }
    var lines = ["# 剧本" + normalizeStoryNo(story.story_no) + "：《" + String(story.title || "") + "》"];
    (story.shots || []).forEach(function(shot) {
      (shot.dialogue || []).forEach(function(dialogue) {
        if (String(dialogue.line || "").trim()) lines.push("台词：" + dialogue.line);
        if (String(dialogue.subtitle || "").trim()) lines.push("字幕：" + dialogue.subtitle);
      });
      if (String(shot.narration || "").trim()) lines.push("旁白：" + shot.narration);
      if (String(shot.on_screen_text || "").trim()) lines.push("画面内文字：" + shot.on_screen_text);
      [
        ["动作描述", shot.action_description],
        ["草图描述", shot.sketch_prompt],
        ["场景", shot.scene],
        ["主体", shot.subject]
      ].forEach(function(item) {
        if (String(item[1] || "").trim()) lines.push(item[0] + "：" + item[1]);
      });
    });
    var report = guard.validateScripts([{
      storyNo: normalizeStoryNo(story.story_no),
      title: story.title,
      text: lines.join("\n")
    }], context, data);
    if (!report.valid) {
      errors = errors.concat(report.errors || []);
      (report.scripts || []).forEach(function(scriptReport) {
        errors = errors.concat(scriptReport.errors || []);
      });
      (report.violations || []).forEach(function(item) {
        errors.push("故事板英文越界：" + item.word + "（" + item.segment_type + "，第" + item.line_number + "行；" + item.reason + "）");
      });
    }
    return { valid: report.valid, errors: Array.from(new Set(errors)), report: report };
  }

  function requiredDraftString(object, key, path, errors) {
    if (!object || typeof object[key] !== "string" || !object[key].trim()) {
      errors.push(path + "." + key + " 必须是非空字符串。");
      return false;
    }
    return true;
  }

  function validateAndNormalizeDraft(input, expected) {
    expected = expected || {};
    var draft = isPlainObject(input) ? safeClone(input) : input;
    var repairs = (expected.repairs || []).slice();
    var errors = [];
    var warnings = [];
    var expectedMode = normalizeMode(expected.mode);
    var expectedNo = normalizeStoryNo(expected.storyNo);

    if (!isPlainObject(draft)) {
      return { valid: false, draft: null, errors: ["根节点必须是JSON对象。"], warnings: [], repairs: repairs };
    }
    if (!draft.schema_version) {
      draft.schema_version = DRAFT_SCHEMA_VERSION;
      pushUnique(repairs, "已补充storyboard-draft-v2版本号。");
    } else if (draft.schema_version !== DRAFT_SCHEMA_VERSION) {
      errors.push('schema_version 必须是 "' + DRAFT_SCHEMA_VERSION + '"。');
    }

    if (!draft.mode) {
      draft.mode = expectedMode;
      pushUnique(repairs, "已根据当前页面补充mode。");
    } else if (draft.mode !== expectedMode) {
      errors.push("模式不匹配：当前页面是" + expectedMode + "，草案是" + draft.mode + "。");
    }

    if (!draft.story_no) {
      draft.story_no = expectedNo;
      pushUnique(repairs, "已根据当前页面补充story_no。");
    } else {
      var actualNo = normalizeStoryNo(draft.story_no);
      if (!actualNo || actualNo !== expectedNo) {
        errors.push("剧本编号不匹配：当前选择剧本" + expectedNo + "，草案是" + draft.story_no + "。");
      } else if (draft.story_no !== actualNo) {
        draft.story_no = actualNo;
        pushUnique(repairs, "已把story_no规范为两位编号。");
      }
    }

    if (typeof draft.title !== "string" || !draft.title.trim()) {
      draft.title = String(expected.title || "剧本" + expectedNo);
      pushUnique(repairs, "已根据当前剧本补充标题。");
    } else if (String(expected.title || "").trim() &&
               draft.title.trim() !== String(expected.title).trim()) {
      errors.push("标题不匹配：当前剧本是“" + String(expected.title).trim() +
        "”，草案是“" + draft.title.trim() + "”。");
    } else {
      draft.title = draft.title.trim();
    }
    if (!isFiniteNumber(draft.total_duration_sec)) {
      errors.push("total_duration_sec 必须是数字。");
    } else if (expectedMode === "short" && (draft.total_duration_sec < 30 || draft.total_duration_sec > 90)) {
      errors.push("短篇总时长必须在30—90秒之间。");
    } else if (expectedMode === "long" && draft.total_duration_sec < 90) {
      errors.push("长篇总时长必须不少于90秒。");
    }

    if (!Array.isArray(draft.target_words) || !draft.target_words.length ||
        draft.target_words.some(function (word) {
          return typeof word !== "string" || !word.trim();
        })) {
      errors.push("target_words 必须是至少包含一个非空词的字符串数组。");
    }
    ["core_twist", "character_continuity", "scene_prop_continuity"].forEach(function (key) {
      requiredDraftString(draft, key, "draft", errors);
    });

    if (!Array.isArray(draft.shots)) {
      errors.push("shots 必须是数组。");
      return { valid: false, draft: draft, errors: errors, warnings: warnings, repairs: repairs };
    }

    var fixed = parseFixedCutPolicy(expectedMode, expected.cutPolicy);
    if (fixed !== null && draft.shots.length !== fixed) {
      errors.push("固定镜头数量要求为" + fixed + "个Cut，实际为" + draft.shots.length + "个。");
    } else if (fixed === null && expectedMode === "short" &&
               (draft.shots.length < 6 || draft.shots.length > 8)) {
      errors.push("短篇自动模式必须为6—8个Cut。");
    } else if (fixed === null && expectedMode === "long" && draft.shots.length < 10) {
      errors.push("长篇自动模式必须至少10个Cut。");
    }

    var previousEnd = 0;
    var dialogueCount = 0;
    draft.shots.forEach(function (shot, index) {
      var path = "shots[" + index + "]";
      if (!isPlainObject(shot)) {
        errors.push(path + " 必须是对象。");
        return;
      }
      var canonicalCut = "Cut " + (index + 1);
      if (shot.cut !== canonicalCut) {
        shot.cut = canonicalCut;
        pushUnique(repairs, "已按数组顺序规范Cut编号。");
      }
      if (!isFiniteNumber(shot.start_sec) || !isFiniteNumber(shot.end_sec)) {
        errors.push(path + "的start_sec和end_sec必须是数字。");
      } else {
        var expectedStart = index === 0 ? 0 : previousEnd;
        var difference = Math.abs(shot.start_sec - expectedStart);
        if (difference <= REPAIR_TOLERANCE && difference > EPSILON) {
          shot.start_sec = expectedStart;
          pushUnique(repairs, "已修正不超过0.01秒的时间衔接误差。");
        } else if (difference > REPAIR_TOLERANCE) {
          errors.push(path + ".start_sec必须连续衔接上一镜end_sec（应为" + expectedStart + "）。");
        }
        if (shot.start_sec < 0 || shot.end_sec <= shot.start_sec) {
          errors.push(path + "时间码必须满足0 <= start_sec < end_sec。");
        }
        previousEnd = shot.end_sec;
      }
      if ((typeof shot.action_progression !== "string" || !shot.action_progression.trim()) &&
          typeof shot.story_function === "string" && shot.story_function.trim()) {
        shot.action_progression = shot.story_function.trim();
        pushUnique(repairs, "已用剧情功能为旧草案补充动作推进。");
      }
      [
        "story_function", "action_progression", "sketch_prompt", "shot_size", "camera_move",
        "subject", "scene", "action_description", "sound", "start_state", "end_state"
      ].forEach(function (key) {
        requiredDraftString(shot, key, path, errors);
      });
      if (!Array.isArray(shot.dialogue)) {
        errors.push(path + ".dialogue必须是数组，无台词时使用空数组。");
      } else {
        shot.dialogue.forEach(function (dialogue, dialogueIndex) {
          var dialoguePath = path + ".dialogue[" + dialogueIndex + "]";
          if (!isPlainObject(dialogue)) {
            errors.push(dialoguePath + "必须是对象。");
            return;
          }
          var hasSpeaker = requiredDraftString(dialogue, "speaker", dialoguePath, errors);
          var hasLine = requiredDraftString(dialogue, "line", dialoguePath, errors);
          if (hasSpeaker && hasLine) dialogueCount += 1;
        });
      }
    });

    if (draft.shots.length && dialogueCount === 0) {
      errors.push("草案缺少角色英文对白，不能安全自动补写。");
    }

    if (isFiniteNumber(draft.total_duration_sec) && draft.shots.length && isFiniteNumber(previousEnd)) {
      var finalDifference = Math.abs(previousEnd - draft.total_duration_sec);
      if (finalDifference <= REPAIR_TOLERANCE && finalDifference > EPSILON) {
        draft.shots[draft.shots.length - 1].end_sec = draft.total_duration_sec;
        pushUnique(repairs, "已修正最后一镜不超过0.01秒的时长误差。");
      } else if (finalDifference > REPAIR_TOLERANCE) {
        errors.push("最后一镜end_sec必须等于total_duration_sec（" + draft.total_duration_sec + "）。");
      }
    }

    return {
      valid: errors.length === 0,
      draft: draft,
      errors: errors,
      warnings: warnings,
      repairs: repairs
    };
  }

  function compactPromptText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function visualStyleFromSettings(settings) {
    settings = settings || {};
    return [
      settings.aspectRatio || "16:9",
      settings.animationStyle || "儿童卡通动画",
      settings.sceneStyle || "场景与道具清楚易辨"
    ].join("；");
  }

  function composeSeedancePrompt(story, shot, settings) {
    settings = Object.assign(defaultSettings("short"), settings || {});
    var continuity = shot.continuity || {};
    var dialogues = Array.isArray(shot.dialogue) ? shot.dialogue : [];
    var dialogueText = dialogues.length
      ? dialogues.map(function (dialogue) {
          return compactPromptText(dialogue.speaker) + "说【" + String(dialogue.line || "") +
            "】，口型与字幕同步显示同一句";
        }).join("；")
      : "本镜无台词";
    var lines = [
      "画幅与风格：" + compactPromptText(settings.aspectRatio) + "；" +
        compactPromptText(settings.animationStyle) + "；" + compactPromptText(settings.sceneStyle) + "。",
      "角色连续性：" + compactPromptText(story.character_continuity) + "。",
      "场景与道具连续性：" + compactPromptText(story.scene_prop_continuity) + "。",
      compactPromptText(shot.cut) + "；景别与运镜：" + compactPromptText(shot.shot_size) +
        "；" + compactPromptText(shot.camera_move) + "。",
      "场景与主体：" + compactPromptText(shot.scene) + "；" + compactPromptText(shot.subject) + "。",
      "动作推进：" + compactPromptText(shot.action_progression || shot.story_function) + "。",
      "动作时序：" + compactPromptText(shot.action_description) + "。",
      "台词与口型：" + dialogueText + "。",
      "声音：" + compactPromptText(shot.sound) + "。",
      "镜头状态：" + compactPromptText(continuity.start_state) + "；镜尾：" +
        compactPromptText(continuity.end_state) + "。"
    ];
    if (compactPromptText(settings.extraLimits)) {
      lines.push("补充限制：" + compactPromptText(settings.extraLimits) + "。");
    }
    lines.push("严格沿用正式剧本，不新增人物、道具、能力、台词、笑点或第二反转。");
    return lines.join("\n");
  }

  function draftToPackage(draft, settings) {
    var story = {
      story_no: draft.story_no,
      title: draft.title,
      status: "ready",
      return_reason: "",
      total_duration_sec: draft.total_duration_sec,
      target_words: safeClone(draft.target_words),
      visual_style: visualStyleFromSettings(settings),
      character_continuity: draft.character_continuity,
      scene_prop_continuity: draft.scene_prop_continuity,
      core_twist: draft.core_twist,
      shots: []
    };
    story.shots = draft.shots.map(function (draftShot, index) {
      var next = draft.shots[index + 1];
      var shot = {
        cut: draftShot.cut,
        start_sec: draftShot.start_sec,
        end_sec: draftShot.end_sec,
        story_function: draftShot.story_function,
        action_progression: draftShot.action_progression || draftShot.story_function,
        sketch_prompt: draftShot.sketch_prompt,
        shot_size: draftShot.shot_size,
        camera_move: draftShot.camera_move,
        subject: draftShot.subject,
        scene: draftShot.scene,
        action_description: draftShot.action_description,
        dialogue: draftShot.dialogue.map(function (dialogue) {
          return {
            speaker: dialogue.speaker,
            line: dialogue.line,
            subtitle: dialogue.line
          };
        }),
        sound: draftShot.sound,
        continuity: {
          start_state: draftShot.start_state,
          end_state: draftShot.end_state,
          next_connection: next ? "承接下一镜：" + next.start_state : "故事结束"
        },
        seedance_prompt: ""
      };
      shot.seedance_prompt = composeSeedancePrompt(story, shot, settings);
      return shot;
    });
    return {
      schema_version: SCHEMA_VERSION,
      mode: draft.mode,
      stories: [story]
    };
  }

  function rebuildSeedancePrompts(pkg, settings, onlyIndex) {
    if (!isPlainObject(pkg) || !Array.isArray(pkg.stories) || !pkg.stories[0]) return pkg;
    var story = pkg.stories[0];
    if (!Array.isArray(story.shots)) return pkg;
    story.visual_style = visualStyleFromSettings(settings);
    story.shots.forEach(function (shot, index) {
      if (typeof onlyIndex === "number" && index !== onlyIndex) return;
      shot.seedance_prompt = composeSeedancePrompt(story, shot, settings);
    });
    return pkg;
  }

  function inspectStoryboardInput(raw, expected) {
    expected = expected || {};
    var syntax = safeRepairJson(raw);
    if (!syntax.valid) {
      return {
        valid: false,
        sourceSchema: "",
        repairedText: syntax.text,
        repairs: syntax.repairs,
        errors: syntax.errors,
        warnings: [],
        package: null
      };
    }

    var value = syntax.value;
    if (value && (value.schema_version === SCHEMA_VERSION || Array.isArray(value.stories))) {
      var legacyCheck = validatePackage(value, {
        mode: expected.mode,
        storyNo: expected.storyNo,
        cutPolicy: expected.cutPolicy
      });
      var legacyRepairs = syntax.repairs.slice();
      if (legacyCheck.valid) pushUnique(legacyRepairs, "已按兼容模式载入旧版完整storyboard-package-v1。");
      return {
        valid: legacyCheck.valid,
        sourceSchema: SCHEMA_VERSION,
        repairedText: JSON.stringify(value, null, 2),
        repairs: legacyRepairs,
        errors: legacyCheck.errors,
        warnings: legacyCheck.warnings,
        package: legacyCheck.valid ? safeClone(value) : null
      };
    }

    var draftCheck = validateAndNormalizeDraft(value, {
      mode: expected.mode,
      storyNo: expected.storyNo,
      title: expected.title,
      cutPolicy: expected.cutPolicy,
      repairs: syntax.repairs
    });
    if (!draftCheck.valid) {
      return {
        valid: false,
        sourceSchema: DRAFT_SCHEMA_VERSION,
        repairedText: draftCheck.draft ? JSON.stringify(draftCheck.draft, null, 2) : syntax.text,
        repairs: draftCheck.repairs,
        errors: draftCheck.errors,
        warnings: draftCheck.warnings,
        package: null
      };
    }

    var pkg = draftToPackage(draftCheck.draft, expected.settings || {});
    var packageCheck = validatePackage(pkg, {
      mode: expected.mode,
      storyNo: expected.storyNo,
      cutPolicy: expected.cutPolicy
    });
    return {
      valid: packageCheck.valid,
      sourceSchema: DRAFT_SCHEMA_VERSION,
      repairedText: JSON.stringify(draftCheck.draft, null, 2),
      repairs: draftCheck.repairs,
      errors: packageCheck.errors,
      warnings: draftCheck.warnings.concat(packageCheck.warnings || []),
      package: packageCheck.valid ? pkg : null
    };
  }

  function buildCorrectionPrompt(raw, errors, expected) {
    expected = expected || {};
    var numberedErrors = (errors || []).map(function (error, index) {
      return (index + 1) + ". " + error;
    }).join("\n");
    return [
      "# 精简故事板JSON纠错任务",
      "",
      "只修复下面storyboard-draft-v2的JSON语法和列出的字段错误。",
      "不得新增、删除或改写镜头、动作、角色和英文台词。",
      "只返回修复后的一个JSON对象，不使用Markdown代码围栏，不添加解释。",
      "",
      "当前任务：mode=" + normalizeMode(expected.mode) + "；story_no=" +
        normalizeStoryNo(expected.storyNo) + "；cut_policy=" + String(expected.cutPolicy || "auto"),
      "",
      "需要修复的问题：",
      numberedErrors || "1. 请重新检查JSON语法和固定字段。",
      "",
      "待修复草案：",
      String(raw || "").trim()
    ].join("\n");
  }

  function buildPrompt(options) {
    options = options || {};
    var mode = normalizeMode(options.mode);
    var story = options.story || {};
    var settings = Object.assign(defaultSettings(mode), options.settings || {});
    var policy = modePolicy(mode);
    var fixed = parseFixedCutPolicy(mode, settings.cutPolicy);
    var cutRule = fixed === null ? policy.autoText : "必须严格输出" + fixed + "个Cut";
    var basePrompt = String(options.basePrompt || "").trim();
    if (!basePrompt) throw new Error("故事板Prompt模板尚未加载。");
    if (!String(story.text || "").trim()) throw new Error("当前剧本内容为空，无法生成Prompt。");
    var no = normalizeStoryNo(story.storyNo);
    return [
      basePrompt, "", "## 本次任务实际输入", "",
      "- mode: " + mode,
      "- story_no: " + no,
      "- duration_rule: " + policy.durationText,
      "- cut_policy: " + cutRule,
      "- aspect_ratio: " + settings.aspectRatio,
      "- animation_style: " + settings.animationStyle,
      "- scene_style: " + settings.sceneStyle,
      "- sketch_style: " + settings.sketchStyle,
      "- extra_limits: " + (settings.extraLimits || "无"),
      "", "只处理下面这一部剧本：", "",
      "===== 剧本" + no + "开始 =====",
      String(story.text || "").trim(),
      "===== 剧本" + no + "结束 =====", "",
      PROMPT_SAFETY_MARKER, "",
      "只返回一个storyboard-draft-v2 JSON对象；不要输出stories外层数组、status、return_reason、subtitle、continuity、visual_style或seedance_prompt。",
      "mode必须为" + mode + "，story_no必须为" + no + "，镜头数量要求：" + cutRule + "。",
      "根对象闭合规则：shots数组结束后只关闭一次顶层JSON对象；顶层对象闭合后禁止继续输出任何 ]、}、说明文字或代码围栏。",
      "保留全部原英文台词，只在dialogue中各出现一次。发送前必须确认完整回复可以被JSON.parse直接解析。"
    ].join("\n");
  }

  function emptyScripts() {
    var list = [];
    for (var i = 1; i <= 6; i += 1) {
      list.push({
        storyNo: String(i).padStart(2, "0"),
        title: "未识别",
        text: "",
        heading: "",
        status: "missing"
      });
    }
    return list;
  }

  function defaultModeState(mode) {
    return {
      version: 1,
      rawScripts: "",
      scripts: emptyScripts(),
      activeIndex: 0,
      settings: defaultSettings(mode),
      promptDrafts: {},
      jsonDrafts: {},
      repairedDrafts: {},
      pendingPackages: {},
      repairReports: {},
      packages: {},
      sourceHashes: {},
      stale: {},
      lastParse: null,
      validation: {},
      vocabularyReport: null,
      vocabularyContextFingerprint: "",
      vocabularyRepairDrafts: {},
      vocabularyScope: { source: "task", draft: null, context: null, dirty: false }
    };
  }

  function safeClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadModeState(mode) {
    var fallback = defaultModeState(mode);
    try {
      var parsed = JSON.parse(root.localStorage.getItem(STORAGE_PREFIX + mode) || "null");
      if (!isPlainObject(parsed)) return fallback;
      var merged = Object.assign(fallback, parsed);
      merged.settings = Object.assign(defaultSettings(mode), isPlainObject(parsed.settings) ? parsed.settings : {});
      merged.scripts = Array.isArray(parsed.scripts) && parsed.scripts.length === 6 ? parsed.scripts : emptyScripts();
      merged.promptDrafts = isPlainObject(parsed.promptDrafts) ? parsed.promptDrafts : {};
      merged.jsonDrafts = isPlainObject(parsed.jsonDrafts) ? parsed.jsonDrafts : {};
      merged.repairedDrafts = isPlainObject(parsed.repairedDrafts) ? parsed.repairedDrafts : {};
      merged.pendingPackages = isPlainObject(parsed.pendingPackages) ? parsed.pendingPackages : {};
      merged.repairReports = isPlainObject(parsed.repairReports) ? parsed.repairReports : {};
      merged.packages = isPlainObject(parsed.packages) ? parsed.packages : {};
      merged.sourceHashes = isPlainObject(parsed.sourceHashes) ? parsed.sourceHashes : {};
      merged.stale = isPlainObject(parsed.stale) ? parsed.stale : {};
      merged.validation = isPlainObject(parsed.validation) ? parsed.validation : {};
      merged.vocabularyReport = isPlainObject(parsed.vocabularyReport) ? parsed.vocabularyReport : null;
      merged.vocabularyContextFingerprint = String(parsed.vocabularyContextFingerprint || "");
      merged.vocabularyRepairDrafts = isPlainObject(parsed.vocabularyRepairDrafts) ? parsed.vocabularyRepairDrafts : {};
      var scope = isPlainObject(parsed.vocabularyScope) ? parsed.vocabularyScope : {};
      merged.vocabularyScope = {
        source: scope.source === "manual" ? "manual" : "task",
        draft: isPlainObject(scope.draft) ? scope.draft : null,
        context: isPlainObject(scope.context) ? scope.context : null,
        dirty: scope.dirty === true
      };
      merged.activeIndex = Math.max(0, Math.min(5, Number(parsed.activeIndex) || 0));
      return merged;
    } catch (error) {
      return fallback;
    }
  }

  var mode = "short";
  var state = null;
  var vocabularyContext = null;
  var dom = {};
  var saveTimer = null;
  var toastTimer = null;
  var objectUrls = {};
  var memoryImages = new Map();
  var dbPromise = null;
  var printSnapshot = null;

  function collectDom() {
    [
      "scriptsInput", "parseScriptsButton", "clearModeButton", "scriptParseStatus", "scriptTabs",
      "vocabularyContextStatus", "vocabularyGuardStatus", "vocabularyViolationGroups",
      "manualVocabularyFields", "manualVocabLevel", "manualBasicRangeField", "manualBasicRange",
      "manualAdvancedGroupField", "manualAdvancedGroup", "manualTargetWords", "manualRangeHint",
      "applyVocabularyRangeButton", "manualVocabularyStatus",
      "vocabularyRepairSummary", "vocabularyRepairPromptOutput",
      "copyVocabularyRepairButton", "revisedScriptInput", "replaceRevisedScriptButton",
      "modePolicyText", "aspectRatio", "cutPolicy", "sketchStyle", "animationStyle",
      "sceneStyle", "extraLimits", "currentPromptStory", "generatePromptButton",
      "copyPromptButton", "promptOutput", "jsonInput", "renderJsonButton", "jsonStatus",
      "repairStatus", "repairLog", "repairedJsonOutput", "revalidateButton",
      "copyCorrectionPromptButton", "confirmBoardButton", "rebuildAllSeedanceButton",
      "boardSubtitle", "boardContent", "copyStoryJsonButton", "printButton",
      "printTopButton", "toast"
    ].forEach(function (id) {
      dom[id] = document.getElementById(id);
    });
    dom.modeRadios = Array.prototype.slice.call(document.querySelectorAll('input[name="storyboardMode"]'));
    dom.vocabularySourceRadios = Array.prototype.slice.call(document.querySelectorAll('input[name="vocabularySource"]'));
  }

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () {
      dom.toast.classList.remove("show");
    }, 2200);
  }

  function setStatus(element, type, message, items) {
    if (!element) return;
    element.className = "status-box" + (type ? " " + type : "");
    element.innerHTML = "";
    var lead = document.createElement("div");
    lead.textContent = message;
    element.appendChild(lead);
    if (items && items.length) {
      var list = document.createElement("ul");
      list.className = "validation-list";
      items.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      element.appendChild(list);
    }
  }

  function vocabularyEnvironment() {
    var errors = [];
    if (!root.VOCABULARY_WHITELIST_DATA) errors.push("缺少离线词表数据vocabulary_whitelist_data.js。");
    if (!root.VocabularyGuard ||
        typeof root.VocabularyGuard.buildVocabularyContext !== "function" ||
        typeof root.VocabularyGuard.validateScripts !== "function" ||
        typeof root.VocabularyGuard.buildAllowedVocabularyContext !== "function" ||
        typeof root.VocabularyGuard.buildRepairPrompt !== "function") {
      errors.push("缺少完整词汇防火墙或Allowed Vocabulary返修组件。");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function vocabularyFingerprint(context) {
    if (!context) return "";
    if (root.VocabularyGuard && typeof root.VocabularyGuard.fingerprintContext === "function") {
      return root.VocabularyGuard.fingerprintContext(context);
    }
    return String(context.task_fingerprint || "");
  }

  function loadVocabularyContextForMode(currentMode) {
    try {
      if (!root.localStorage) return null;
      var parsed = JSON.parse(root.localStorage.getItem(
        VOCABULARY_CONTEXT_STORAGE_PREFIX + currentMode
      ) || "null");
      return isPlainObject(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function buildManualVocabularyContext(draft, currentMode, data, guard) {
    draft = draft || {};
    var errors = [];
    var level = draft.level;
    var range = String(draft.basicRange || "").trim().replace(/[—–－]/g, "-");
    var rangeMatch = /^(?:1\s*-\s*)?(\d+)$/.exec(range);
    var group = String(draft.advancedGroup || "").trim();
    if (level === "basic" && !rangeMatch) {
      errors.push("基础词范围请输入上限数字或1-上限，例如495或1-495。");
    }
    if (level === "advanced" && !/^[1-9]\d*$/.test(group)) {
      errors.push("当前高级Group必须是正整数。");
    }
    var words = String(draft.targetWords || "").split(/[,，、/|;；\r\n]+/)
      .map(function (word) { return word.trim(); }).filter(Boolean);
    if (words.some(function (word) { return !/^[A-Za-z]+(?:[ '-][A-Za-z]+)*\.?$/.test(word); })) {
      errors.push("学习台词目标词只填写英文词或短语，用逗号或斜杠分隔，不填写词性和中文说明。");
    }
    if (errors.length) return { valid: false, errors: errors };
    return guard.buildVocabularyContext({
      mode: currentMode,
      vocabLevel: level,
      basicRankMax: rangeMatch ? Number(rangeMatch[1]) : undefined,
      advancedGroupId: level === "advanced" ? Number(group) : undefined,
      targetWords: words
    }, data);
  }

  function vocabularyScopeContext(scope, taskContext) {
    return scope.source === "manual" ? (scope.dirty ? null : scope.context) : taskContext;
  }

  function vocabularyPromptLock(context, source) {
    return [
      "", "## 词汇白名单任务锁定",
      "- vocabulary_context_schema: " + context.schema_version,
      "- task_fingerprint: " + context.task_fingerprint,
      "- source_fingerprint: " + context.source_fingerprint,
      "- 当前正式剧本已通过离线白名单复核；不得改写标题、对白、字幕、旁白或画面内英文。",
      source === "manual"
        ? "- 本次词汇范围由故事板页面手动设置；无需原生产流程对话或重新读取Excel。只使用输入的正式剧本设计分镜，不新增英文表达。"
        : "- 必须在原生产流程同一GPT对话中执行，以继续读取本轮上传的六个Excel和原词汇上下文。"
    ].join("\n");
  }

  function renderVocabularyScopeControls() {
    var scope = state.vocabularyScope;
    if (!scope.draft) {
      var context = scope.context || loadVocabularyContextForMode(mode);
      scope.draft = {
        level: context && context.vocab_level === "advanced" ? "advanced" : "basic",
        basicRange: context && Number.isInteger(context.basic_rank_max) ? String(context.basic_rank_max) : "",
        advancedGroup: context && context.advanced_group_id ? String(context.advanced_group_id) : "",
        targetWords: context && Array.isArray(context.target_words)
          ? context.target_words.map(function (word) { return word.word; }).join(" / ") : ""
      };
    }
    dom.vocabularySourceRadios.forEach(function (radio) { radio.checked = radio.value === scope.source; });
    dom.manualVocabularyFields.hidden = scope.source !== "manual";
    dom.manualVocabLevel.value = scope.draft.level;
    dom.manualBasicRange.value = scope.draft.basicRange || "";
    dom.manualAdvancedGroup.value = scope.draft.advancedGroup || "";
    dom.manualTargetWords.value = scope.draft.targetWords || "";
    dom.promptOutput.placeholder = scope.source === "manual"
      ? "当前剧本通过手动范围白名单检查后，可生成精简分镜Prompt并复制给GPT。"
      : "生成后的精简分镜Prompt会显示在这里；请完整复制到原生产流程同一GPT对话。";
    renderManualVocabularyHint();
    setStatus(dom.manualVocabularyStatus, scope.context && !scope.dirty ? "success" : "warn",
      scope.context && !scope.dirty
        ? "手动范围已应用，检测和返修均使用此范围。"
        : "填写范围和本组4个学习台词目标词后，点击“应用范围并检查剧本”。"
    );
  }

  function renderManualVocabularyHint() {
    var advanced = dom.manualVocabLevel.value === "advanced";
    var data = root.VOCABULARY_WHITELIST_DATA || {};
    dom.manualBasicRangeField.hidden = advanced;
    dom.manualAdvancedGroupField.hidden = !advanced;
    dom.manualRangeHint.textContent = (advanced
      ? "高级范围：全部基础词 + 当前Group之前的高级词 + 本组学习台词目标词；Group上限为" + (data.advanced && data.advanced.max_group || "未加载") + "。"
      : "基础范围：master_vocab_basic_with_pos.xlsx 中basic_order_rank从1到输入上限的词 + 本组学习台词目标词；上限为" + (data.basic && data.basic.max_rank || "未加载") + "，0表示仅允许本组词及检测器认可的词形。"
    ) + " 手动范围应用于当前模式这一批剧本，独立保存。";
  }

  function editManualVocabularyRange() {
    var scope = state.vocabularyScope;
    scope.draft = {
      level: dom.manualVocabLevel.value,
      basicRange: dom.manualBasicRange.value,
      advancedGroup: dom.manualAdvancedGroup.value,
      targetWords: dom.manualTargetWords.value
    };
    scope.dirty = true;
    renderManualVocabularyHint();
    refreshVocabularyContextFromStorage();
    syncActiveDrafts();
    renderVocabularyGuard();
    setStatus(dom.manualVocabularyStatus, "warn", "词汇范围已修改，应用后重新检测；当前旧检测结果不再生效。");
    scheduleSave();
  }

  function applyManualVocabularyRange() {
    var environment = vocabularyEnvironment();
    if (!environment.valid) {
      setStatus(dom.manualVocabularyStatus, "error", "词表组件不可用。", environment.errors);
      return;
    }
    var result = buildManualVocabularyContext(state.vocabularyScope.draft, mode,
      root.VOCABULARY_WHITELIST_DATA, root.VocabularyGuard);
    if (!result.valid) {
      setStatus(dom.manualVocabularyStatus, "error", "词汇范围未应用，请修正输入。", result.errors);
      return;
    }
    state.vocabularyScope.context = result;
    state.vocabularyScope.dirty = false;
    renderVocabularyScopeControls();
    refreshVocabularyContextFromStorage();
    parseScriptsFromInput();
    showToast("手动词汇范围已应用" + (state.rawScripts.trim() ? "，已重新检测剧本。" : "，请粘贴剧本进行检查。"));
  }

  function selectVocabularySource(source) {
    state.vocabularyScope.source = source === "manual" ? "manual" : "task";
    renderVocabularyScopeControls();
    refreshVocabularyContextFromStorage();
    if (vocabularyContextCheck(vocabularyContext).valid) parseScriptsFromInput();
    else {
      syncActiveDrafts();
      renderVocabularyGuard();
      saveNow();
    }
  }

  function vocabularyContextCheck(context) {
    var environment = vocabularyEnvironment();
    var errors = environment.errors.slice();
    if (!context) {
      errors.push(state && state.vocabularyScope.source === "manual"
        ? "请填写并应用手动词汇范围。"
        : "当前模式没有任务词汇范围，可在上方手动设置，或从故事生产工具传入。");
    } else {
      if (context.schema_version !== "vocabulary-context-v1") errors.push("词汇上下文版本无效。");
      if (context.valid !== true) errors.push("词汇上下文未通过初始化校验。");
      if (context.mode !== mode) errors.push("词汇上下文模式与当前故事板模式不一致。");
      if (context.vocab_level !== "basic" && context.vocab_level !== "advanced") {
        errors.push("词汇上下文层级无效。");
      }
      if (!Array.isArray(context.target_words) || context.target_words.length !== 4) {
        errors.push("词汇上下文必须包含恰好4个目标词。");
      } else {
        var seenTargets = {};
        context.target_words.forEach(function(target) {
          var surface = String(target && target.word !== undefined ? target.word : target || "").trim().toLowerCase();
          if (!surface) errors.push("词汇上下文目标词不能包含空值。");
          else if (seenTargets[surface]) errors.push("词汇上下文目标词不能重复：" + surface + "。");
          seenTargets[surface] = true;
        });
      }
      if (context.vocab_level === "basic" && !Number.isInteger(context.basic_rank_max)) {
        errors.push("基础词汇上下文缺少有效Rank上限。");
      }
      if (context.vocab_level === "advanced" && !Number.isInteger(context.advanced_group_id)) {
        errors.push("高级词汇上下文缺少当前Group编号。");
      }
      if (root.VOCABULARY_WHITELIST_DATA &&
          context.source_fingerprint !== root.VOCABULARY_WHITELIST_DATA.source_fingerprint) {
        errors.push("离线词表版本已变化，请重新应用手动范围，或从故事生产工具重新传入任务范围。");
      }
      var fingerprint = vocabularyFingerprint(context);
      if (!context.task_fingerprint || !fingerprint || context.task_fingerprint !== fingerprint) {
        errors.push("词汇上下文任务指纹不一致，可能已过期或被修改。");
      }
    }
    return {
      valid: errors.length === 0,
      errors: errors,
      fingerprint: context ? vocabularyFingerprint(context) : ""
    };
  }

  function refreshVocabularyContextFromStorage() {
    var next = vocabularyScopeContext(state.vocabularyScope, loadVocabularyContextForMode(mode));
    var check = vocabularyContextCheck(next);
    var nextFingerprint = check.valid ? check.fingerprint : "";
    if (!check.valid || String(state.vocabularyContextFingerprint || "") !== nextFingerprint) {
      state.vocabularyReport = null;
      state.promptDrafts = {};
      state.vocabularyRepairDrafts = {};
      state.pendingPackages = {};
      state.repairReports = {};
      state.vocabularyContextFingerprint = nextFingerprint;
    }
    vocabularyContext = next;
    return check;
  }

  function scriptsForVocabularyGuard() {
    return state.scripts.filter(function(script) {
      return !!String(script.text || "").trim();
    }).map(function(script) {
      return {
        storyNo: script.storyNo,
        story_no: script.storyNo,
        title: script.title,
        text: script.text,
        heading: script.heading,
        status: script.status
      };
    });
  }

  function vocabularyScriptReport(no) {
    var reports = state.vocabularyReport && Array.isArray(state.vocabularyReport.scripts)
      ? state.vocabularyReport.scripts : [];
    for (var i = 0; i < reports.length; i += 1) {
      if (normalizeStoryNo(reports[i].story_no) === normalizeStoryNo(no)) return reports[i];
    }
    return null;
  }

  function vocabularyViolationsFor(no) {
    var report = vocabularyScriptReport(no);
    if (report && Array.isArray(report.violations)) return report.violations;
    var all = state.vocabularyReport && Array.isArray(state.vocabularyReport.violations)
      ? state.vocabularyReport.violations : [];
    return all.filter(function(item) {
      return normalizeStoryNo(item.story_no) === normalizeStoryNo(no);
    });
  }

  function vocabularyGateReady(options) {
    options = options || {};
    var scripts = Array.isArray(options.scripts) ? options.scripts : [];
    var report = options.report;
    var sixPresent = scripts.length === 6 && scripts.every(function(script) {
      return !!String(script.text || "").trim();
    });
    return options.contextValid === true && sixPresent && options.parseOk === true &&
      !!report && report.valid === true &&
      report.task_fingerprint === options.fingerprint &&
      report.summary && Number(report.summary.valid_script_count) === 6;
  }

  function vocabularyScriptGateReady(options) {
    options = options || {};
    var script = options.script || {};
    var report = options.report;
    if (
      options.contextValid !== true ||
      !String(script.text || "").trim() ||
      !report ||
      report.task_fingerprint !== options.fingerprint
    ) {
      return false;
    }
    var storyNo = normalizeStoryNo(options.storyNo || script.storyNo);
    var reports = Array.isArray(report.scripts) ? report.scripts : [];
    for (var i = 0; i < reports.length; i += 1) {
      if (normalizeStoryNo(reports[i].story_no) === storyNo) {
        return reports[i].valid === true;
      }
    }
    return false;
  }

  function allVocabularyChecksReady() {
    var check = vocabularyContextCheck(vocabularyContext);
    return vocabularyGateReady({
      contextValid: check.valid,
      fingerprint: check.fingerprint,
      scripts: state.scripts,
      parseOk: !!(state.lastParse && state.lastParse.ok),
      report: state.vocabularyReport
    });
  }

  function currentVocabularyCheckReady() {
    var check = vocabularyContextCheck(vocabularyContext);
    var script = currentScript();
    return vocabularyScriptGateReady({
      contextValid: check.valid,
      fingerprint: check.fingerprint,
      storyNo: script.storyNo,
      script: script,
      report: state.vocabularyReport
    });
  }

  function updateVocabularyPromptGate() {
    var ready = currentVocabularyCheckReady();
    dom.generatePromptButton.disabled = !ready;
    dom.copyPromptButton.disabled = !ready || !isSafePrompt(dom.promptOutput.value, vocabularyContext);
    dom.generatePromptButton.title = ready
      ? "当前选中剧本已通过词汇白名单检查，可以生成精简Prompt。"
      : "当前选中剧本尚未通过词汇白名单检查。";
  }

  function renderVocabularyContextStatus() {
    var check = vocabularyContextCheck(vocabularyContext);
    if (!check.valid) {
      setStatus(dom.vocabularyContextStatus, "error", "词汇白名单上下文不可用，故事板Prompt已关闭。", check.errors);
      return;
    }
    var targets = (vocabularyContext.target_words || []).map(function(item) {
      return item.word + (item.pos ? "（" + item.pos + "）" : "");
    }).join(" / ");
    var previousGroups = Math.max(0, Number(vocabularyContext.advanced_group_id) - 1);
    var range = vocabularyContext.vocab_level === "advanced"
      ? "全部基础词" + (previousGroups ? " + 高级Group 1—" + previousGroups : "（无前序高级Group）")
      : (vocabularyContext.basic_rank_max === 0 ? "无已学基础词" : "基础词basic_order_rank 1—" + Number(vocabularyContext.basic_rank_max));
    setStatus(dom.vocabularyContextStatus, "success",
      (state.vocabularyScope.source === "manual" ? "手动词汇范围已就绪｜" : "词汇上下文已就绪（任务传入）｜") +
      (vocabularyContext.vocab_level === "advanced" ? "高级" : "基础") +
      "｜目标词：" + targets + "｜允许范围：" + range + " + 当前目标词｜任务指纹：" + check.fingerprint
    );
  }

  function renderVocabularyViolationGroups() {
    if (!dom.vocabularyViolationGroups) return;
    dom.vocabularyViolationGroups.innerHTML = "";
    dom.vocabularyViolationGroups.classList.add("selected-only");
    if (!state.vocabularyReport || !Array.isArray(state.vocabularyReport.scripts)) return;

    var script = currentScript();
    var report = vocabularyScriptReport(script.storyNo);
    var card = document.createElement("article");
    var valid = !!(report && report.valid);
    card.className = "violation-group" + (valid ? " valid" : "");
    var title = document.createElement("h4");
    title.textContent = "当前查看：剧本" + script.storyNo + "｜" +
      (valid ? "白名单通过" : (String(script.text || "").trim() ? "需要返修" : "尚未粘贴"));
    card.appendChild(title);

    if (valid) {
      var ok = document.createElement("div");
      ok.className = "violation-meta";
      ok.textContent = "已检查" + Number(report.summary && report.summary.checked_word_count || 0) +
        "个英文词/短语，未发现越界。";
      card.appendChild(ok);
    } else {
      var items = [];
      if (report && Array.isArray(report.errors)) {
        items = items.concat(report.errors.map(function (message) {
          return { error: message };
        }));
      }
      if (report && Array.isArray(report.violations)) {
        items = items.concat(report.violations);
      }
      var list = document.createElement("ul");
      if (!items.length) {
        var empty = document.createElement("li");
        empty.textContent = String(script.text || "").trim()
          ? "尚无具体违规明细，请重新识别检查。" : "缺少完整剧本。";
        list.appendChild(empty);
      }
      items.forEach(function (item) {
        var li = document.createElement("li");
        if (item.error) {
          li.textContent = item.error;
        } else {
          li.innerHTML = '<span class="violation-word">' + escapeHtml(item.word) + "</span> " +
            '<span class="violation-meta">第' + escapeHtml(item.line_number) + "行 · " +
            escapeHtml(item.segment_type) + " · " + escapeHtml(item.reason_code) + "</span>" +
            '<span class="violation-context">' + escapeHtml(item.reason) + "｜" +
            escapeHtml(item.context || "") + "</span>";
        }
        list.appendChild(li);
      });
      card.appendChild(list);
    }
    dom.vocabularyViolationGroups.appendChild(card);
  }
  function renderVocabularyRepairControls() {
    var no = currentNo();
    var scriptReport = vocabularyScriptReport(no);
    var script = currentScript();
    var contextCheck = vocabularyContextCheck(vocabularyContext);
    var violations = vocabularyViolationsFor(no);
    var scriptErrors = scriptReport && Array.isArray(scriptReport.errors)
      ? scriptReport.errors : [];
    var prompt = "";

    dom.revisedScriptInput.value = state.vocabularyRepairDrafts[no] || "";
    dom.replaceRevisedScriptButton.disabled = !String(dom.revisedScriptInput.value || "").trim();
    dom.vocabularyRepairPromptOutput.value = "";
    dom.copyVocabularyRepairButton.disabled = true;

    if (!contextCheck.valid) {
      setStatus(dom.vocabularyRepairSummary, "error", "Allowed Vocabulary Context不可用，无法生成返修Prompt。", contextCheck.errors);
      return;
    }
    if (!String(script.text || "").trim()) {
      setStatus(dom.vocabularyRepairSummary, "warn", "当前剧本尚未识别，暂无返修Prompt。");
      return;
    }
    if (!state.vocabularyReport || !scriptReport) {
      setStatus(dom.vocabularyRepairSummary, "warn", "请先点击“识别六个剧本”执行白名单检测。");
      return;
    }
    if (scriptReport.valid === true) {
      setStatus(dom.vocabularyRepairSummary, "success", "剧本" + no + "已通过白名单检测，无需生成返修Prompt。", [
        "违规词：0个。"
      ]);
      return;
    }

    try {
      var allowedContext = root.VocabularyGuard.buildAllowedVocabularyContext(
        vocabularyContext, root.VOCABULARY_WHITELIST_DATA
      );
      if (!allowedContext.valid) {
        throw new Error(allowedContext.errors.join("；"));
      }
      prompt = root.VocabularyGuard.buildRepairPrompt(
        script,
        violations,
        vocabularyContext,
        scriptErrors,
        root.VOCABULARY_WHITELIST_DATA
      );
      dom.vocabularyRepairPromptOutput.value = prompt;
      dom.copyVocabularyRepairButton.disabled = !prompt;

      var distinctWords = new Set(violations.map(function (item) {
        return String(item.normalized_word || item.word || "").toLowerCase();
      }).filter(Boolean));
      var counts = allowedContext.counts;
      var details = [
        "basic_order_rank≤" + vocabularyContext.basic_rank_max + "：" +
          counts.basic_word_count + "个基础词。",
        "检测器允许的规则词形：" + counts.generated_form_count + "个；有效允许词总数：" +
          counts.effective_allowed_word_count + "个。",
        "当前学习台词目标词：" + allowedContext.target_words.join(","),
        "违规项：" + violations.length + "处；不同违规词：" + distinctWords.size + "个。"
      ];
      if (vocabularyContext.vocab_level === "advanced") {
        details.splice(1, 0,
          "已学高级Group词：" + counts.learned_advanced_word_count + "个。"
        );
      }
      if (scriptErrors.length) {
        details.push("另有" + scriptErrors.length + "项标题或结构问题，已一并写入Prompt。");
      }
      setStatus(dom.vocabularyRepairSummary, "warn", "剧本" + no + "返修Prompt已自动生成。", details);
    } catch (error) {
      dom.vocabularyRepairPromptOutput.value = "";
      dom.copyVocabularyRepairButton.disabled = true;
      setStatus(dom.vocabularyRepairSummary, "error", "返修Prompt生成失败。", [
        error.message || "Allowed Vocabulary Context生成失败。"
      ]);
    }
  }
  function renderVocabularyGuardStatus() {
    var contextCheck = vocabularyContextCheck(vocabularyContext);
    var report = state.vocabularyReport;
    var recognized = state.scripts.filter(function(script) {
      return !!String(script.text || "").trim();
    }).length;
    if (!contextCheck.valid) {
      setStatus(dom.vocabularyGuardStatus, "error", "无法执行词汇检查，分镜Prompt保持关闭。", contextCheck.errors);
    } else if (!report) {
      setStatus(dom.vocabularyGuardStatus, "warn", "剧本内容或词汇上下文尚未完成校验。请点击“识别六个剧本”。");
    } else if (report.task_fingerprint !== contextCheck.fingerprint) {
      setStatus(dom.vocabularyGuardStatus, "error", "校验结果已经过期。请重新识别六个剧本。");
    } else if (report.valid && report.summary && Number(report.summary.valid_script_count) === 6) {
      setStatus(dom.vocabularyGuardStatus, "success",
        "6/6部剧本已通过词汇白名单检查，可以逐部生成分镜Prompt。",
        ["共检查" + Number(report.summary.checked_word_count || 0) + "个英文词/短语；违规0个。"]
      );
    } else if (report.valid && recognized > 0 && recognized < 6) {
      setStatus(dom.vocabularyGuardStatus, "warn",
        "已粘贴的" + recognized + "部剧本均通过词汇检查；可以选择任一已通过剧本生成当前精简Prompt。",
        ["其他剧本可以后续补齐；当前已检查" + Number(report.summary && report.summary.checked_word_count || 0) + "个英文词/短语，违规0个。"]
      );
    } else {
      var summary = report.summary || {};
      var validScriptCount = Number(summary.valid_script_count || 0);
      var guardDetails = (report.errors || []).slice();
      guardDetails.unshift(validScriptCount > 0
        ? "选择上方标记为“词汇通过”的剧本，即可生成该剧本的精简Prompt；红色违规剧本仍需返修。"
        : "当前没有通过白名单检查的剧本，第三步暂不可生成。"
      );
      setStatus(dom.vocabularyGuardStatus, "error",
        "词汇白名单未通过：已粘贴" + recognized + "部，其中" +
        validScriptCount + "部合格，发现" +
        Number(summary.violation_count || 0) + "个越界词。",
        guardDetails
      );
    }
    renderVocabularyViolationGroups();
    renderVocabularyRepairControls();
    updateVocabularyPromptGate();
  }

  function renderVocabularyGuard() {
    renderVocabularyContextStatus();
    renderVocabularyGuardStatus();
    renderTabs();
  }

  function runVocabularyValidation() {
    var check = refreshVocabularyContextFromStorage();
    if (!check.valid) {
      state.vocabularyReport = null;
      renderVocabularyGuard();
      saveNow();
      return null;
    }
    try {
      state.vocabularyReport = root.VocabularyGuard.validateScripts(
        scriptsForVocabularyGuard(), vocabularyContext, root.VOCABULARY_WHITELIST_DATA
      );
    } catch (error) {
      state.vocabularyReport = {
        valid: false,
        task_fingerprint: check.fingerprint,
        errors: [error.message || "词汇检查执行失败。"],
        scripts: [],
        violations: [],
        summary: { valid_script_count: 0, invalid_script_count: 0, violation_count: 0, checked_word_count: 0 }
      };
    }
    renderVocabularyGuard();
    saveNow();
    return state.vocabularyReport;
  }

  function saveNow() {
    if (!state) return;
    try {
      root.localStorage.setItem(STORAGE_PREFIX + mode, JSON.stringify(state));
    } catch (error) {
      showToast("本地保存空间不足，请先备份JSON或清理旧草稿。");
    }
  }

  function scheduleSave() {
    root.clearTimeout(saveTimer);
    saveTimer = root.setTimeout(saveNow, 180);
  }

  function currentScript() {
    return state.scripts[state.activeIndex] || emptyScripts()[0];
  }

  function currentNo() {
    return currentScript().storyNo || String(state.activeIndex + 1).padStart(2, "0");
  }

  function populateCutPolicy() {
    var policy = modePolicy(mode);
    var existing = String(state.settings.cutPolicy || "auto");
    dom.cutPolicy.innerHTML = "";
    policy.cutOptions.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      dom.cutPolicy.appendChild(option);
    });
    var valid = policy.cutOptions.some(function (item) { return item.value === existing; });
    state.settings.cutPolicy = valid ? existing : policy.defaultCutPolicy;
    dom.cutPolicy.value = state.settings.cutPolicy;
    dom.modePolicyText.textContent = (mode === "short" ? "短篇" : "长篇") + "：" +
      policy.durationText + "；" + policy.autoText + "。";
  }

  function syncFormFromState() {
    if (!state.vocabularyScope.draft && !loadVocabularyContextForMode(mode)) {
      state.vocabularyScope.source = "manual";
    }
    renderVocabularyScopeControls();
    refreshVocabularyContextFromStorage();
    dom.scriptsInput.value = state.rawScripts || "";
    dom.aspectRatio.value = state.settings.aspectRatio || "16:9";
    populateCutPolicy();
    dom.sketchStyle.value = state.settings.sketchStyle || "";
    dom.animationStyle.value = state.settings.animationStyle || "";
    dom.sceneStyle.value = state.settings.sceneStyle || "";
    dom.extraLimits.value = state.settings.extraLimits || "";
    dom.modeRadios.forEach(function (radio) { radio.checked = radio.value === mode; });
    renderParseStatus();
    renderTabs();
    syncActiveDrafts();
    renderBoard();
    renderVocabularyGuard();
  }

  function renderParseStatus() {
    var parse = state.lastParse;
    var recognized = state.scripts.filter(function (script) { return !!String(script.text || "").trim(); }).length;
    if (!parse && recognized === 0) {
      setStatus(dom.scriptParseStatus, "", "尚未识别剧本。");
      return;
    }
    var messages = [];
    if (parse && parse.missing && parse.missing.length) {
      messages.push("缺少编号：" + parse.missing.join("、"));
    }
    if (parse && parse.duplicates && parse.duplicates.length) {
      messages.push("重复编号：" + parse.duplicates.join("、"));
    }
    if (parse && parse.warnings) messages = messages.concat(parse.warnings);
    var ok = parse ? parse.ok : recognized === 6;
    setStatus(
      dom.scriptParseStatus,
      ok ? (messages.length ? "warn" : "success") : "error",
      "已识别 " + recognized + "/6 部剧本。" +
        (ok ? " 编号结构通过，请继续查看词汇防火墙结果。" : " 请先修正编号后重新识别。"),
      messages
    );
  }

  function tabState(no, script) {
    var pkg = state.packages[no];
    var storyboardReport = state.repairReports[no];
    if (!String(script.text || "").trim()) return { label: "缺失", className: "" };
    if (state.stale[no]) return { label: "已过期", className: "" };
    var contextCheck = vocabularyContextCheck(vocabularyContext);
    var vocabularyReport = state.vocabularyReport && contextCheck.valid &&
      state.vocabularyReport.task_fingerprint === contextCheck.fingerprint
      ? vocabularyScriptReport(no) : null;
    if (vocabularyReport && vocabularyReport.valid === false) {
      return { label: "词汇违规", className: " vocab-invalid" };
    }
    var vocabularyClass = vocabularyReport && vocabularyReport.valid === true ? " vocab-valid" : "";
    if (pkg && state.validation[no] && state.validation[no].valid === false) {
      return { label: "板内待修", className: vocabularyClass };
    }
    if (pkg && pkg.stories && pkg.stories[0] && pkg.stories[0].status === "return_to_script") {
      return { label: "旧版退回", className: vocabularyClass };
    }
    if (pkg) return { label: "已出板", className: vocabularyClass };
    if (storyboardReport && storyboardReport.valid && state.pendingPackages[no]) {
      return { label: "待确认", className: vocabularyClass };
    }
    if (storyboardReport && !storyboardReport.valid) return { label: "待纠错", className: vocabularyClass };
    if (vocabularyClass) return { label: "词汇通过", className: vocabularyClass };
    return { label: "已识别", className: "" };
  }

  function renderTabs() {
    dom.scriptTabs.innerHTML = "";
    state.scripts.forEach(function (script, index) {
      var button = document.createElement("button");
      var status = tabState(script.storyNo, script);
      button.type = "button";
      button.className = "script-tab" + status.className + (index === state.activeIndex ? " active" : "");
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");
      button.setAttribute("data-index", String(index));
      var no = document.createElement("span");
      no.className = "tab-no";
      no.textContent = "剧本" + script.storyNo;
      var flag = document.createElement("span");
      flag.className = "tab-state";
      flag.textContent = status.label;
      no.appendChild(flag);
      var title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = script.title || "未识别";
      button.appendChild(no);
      button.appendChild(title);
      dom.scriptTabs.appendChild(button);
    });
  }

  function syncActiveDrafts() {
    var script = currentScript();
    var no = currentNo();
    var available = !!String(script.text || "").trim();
    dom.currentPromptStory.textContent = available
      ? "当前：剧本" + no + "《" + (script.title || "未命名") + "》"
      : "剧本" + no + "尚未识别，不能生成Prompt。";
    var storedPrompt = state.promptDrafts[no] || "";
    dom.promptOutput.value = storedPrompt;
    if (storedPrompt.trim() && !isSafePrompt(storedPrompt, vocabularyContext)) {
      dom.currentPromptStory.textContent += " · 当前是旧版Prompt，请重新生成";
    }
    dom.jsonInput.value = state.jsonDrafts[no] || "";
    dom.repairedJsonOutput.value = state.repairedDrafts[no] || "";
    dom.revisedScriptInput.value = state.vocabularyRepairDrafts[no] || "";
    renderJsonStatus(no);
    renderVocabularyViolationGroups();
    renderVocabularyRepairControls();
    updateVocabularyPromptGate();
  }

  function renderJsonStatus(no) {
    var report = state.repairReports[no];
    var hasSavedBoard = !!state.packages[no];
    if (!report) {
      setStatus(dom.jsonStatus, "", "剧本" + no + "的GPT草案尚未检查。");
      setStatus(dom.repairStatus, "", "尚未执行安全纠错。");
      setStatus(dom.repairLog, "", "自动修复记录将在这里显示。");
      dom.revalidateButton.disabled = !String(dom.repairedJsonOutput.value || "").trim();
      dom.copyCorrectionPromptButton.disabled = true;
      dom.confirmBoardButton.disabled = true;
      return;
    }

    var repairs = report.repairs || [];
    var warnings = report.warnings || [];
    setStatus(
      dom.repairLog,
      repairs.length ? "success" : "",
      repairs.length ? "已完成" + repairs.length + "项安全修复。" : "没有需要自动修改的语法或确定字段。",
      repairs
    );

    var pendingReady = report.valid && !!state.pendingPackages[no];
    var confirmed = report.valid && report.confirmed === true && hasSavedBoard;
    if (pendingReady || confirmed) {
      setStatus(
        dom.jsonStatus,
        "success",
        confirmed ? "草案已确认并生成故事板。" : "草案解析与结构检查通过，请在第五步确认生成故事板。"
      );
      setStatus(
        dom.repairStatus,
        warnings.length ? "warn" : "success",
        confirmed
          ? "安全纠错与确认均已完成。"
          : "安全纠错通过。确认前不会覆盖" + (hasSavedBoard ? "原故事板。" : "任何故事板。"),
        warnings
      );
      dom.copyCorrectionPromptButton.disabled = true;
      dom.confirmBoardButton.disabled = confirmed;
    } else {
      var failureLead = hasSavedBoard
        ? "草案未通过检查，原故事板保持不变。"
        : "草案未通过检查，尚未生成故事板。";
      setStatus(dom.jsonStatus, "error", failureLead, report.errors || []);
      setStatus(dom.repairStatus, "error", "存在不能安全猜测或补写的问题，请修正后重新校验。", report.errors || []);
      dom.copyCorrectionPromptButton.disabled = false;
      dom.confirmBoardButton.disabled = true;
    }
    dom.revalidateButton.disabled = !String(dom.repairedJsonOutput.value || "").trim();
  }

  function selectStory(index) {
    state.promptDrafts[currentNo()] = dom.promptOutput.value;
    state.jsonDrafts[currentNo()] = dom.jsonInput.value;
    state.repairedDrafts[currentNo()] = dom.repairedJsonOutput.value;
    state.vocabularyRepairDrafts[currentNo()] = dom.revisedScriptInput.value;
    state.activeIndex = Math.max(0, Math.min(5, Number(index) || 0));
    scheduleSave();
    renderTabs();
    syncActiveDrafts();
    renderBoard();
  }

  function parseScriptsFromInput() {
    state.rawScripts = dom.scriptsInput.value;
    var result = splitScripts(state.rawScripts);
    var oldScripts = state.scripts;
    state.scripts = result.scripts;
    state.vocabularyReport = null;
    state.lastParse = {
      ok: result.ok,
      missing: result.missing,
      duplicates: result.duplicates,
      warnings: result.warnings,
      headingCount: result.headingCount
    };
    state.scripts.forEach(function (script, index) {
      var no = script.storyNo;
      var newHash = textHash(script.text);
      var oldHash = state.sourceHashes[no] ||
        (oldScripts[index] && oldScripts[index].text ? textHash(oldScripts[index].text) : "");
      var sourceChanged = !!oldHash && oldHash !== newHash;
      if (sourceChanged) {
        delete state.pendingPackages[no];
        delete state.repairReports[no];
        delete state.repairedDrafts[no];
        delete state.promptDrafts[no];
        delete state.vocabularyRepairDrafts[no];
      }
      if (state.packages[no]) {
        state.stale[no] = script.text
          ? !!(state.sourceHashes[no] && state.sourceHashes[no] !== newHash)
          : true;
      } else {
        state.stale[no] = false;
      }
    });
    renderParseStatus();
    syncActiveDrafts();
    renderBoard();
    runVocabularyValidation();
    showToast(allVocabularyChecksReady()
      ? "六个剧本已识别并通过词汇白名单检查。"
      : "剧本已识别并完成词汇检查，请查看编号和违规提示。");
  }

  function switchMode(nextMode) {
    nextMode = normalizeMode(nextMode);
    if (nextMode === mode) return;
    state.promptDrafts[currentNo()] = dom.promptOutput.value;
    state.jsonDrafts[currentNo()] = dom.jsonInput.value;
    state.repairedDrafts[currentNo()] = dom.repairedJsonOutput.value;
    state.vocabularyRepairDrafts[currentNo()] = dom.revisedScriptInput.value;
    saveNow();
    mode = nextMode;
    state = loadModeState(mode);
    try {
      var url = new URL(root.location.href);
      url.searchParams.set("mode", mode);
      root.history.replaceState(null, "", url.href);
    } catch (error) {
      /* file://环境不支持history时仍可正常切换 */
    }
    syncFormFromState();
    showToast("已切换为" + (mode === "short" ? "短篇" : "长篇") + "草稿；两种模式互不覆盖。");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function textareaEditor(path, value, extraClass, rows) {
    return '<textarea class="cell-editor ' + (extraClass || "") +
      '" rows="' + (rows || 2) + '" data-edit-path="' + escapeHtml(path) + '">' +
      escapeHtml(value) + "</textarea>";
  }

  function numberEditor(path, value) {
    return '<input class="cell-editor compact time-editor" type="number" min="0" step="0.1" data-value-type="number" data-edit-path="' +
      escapeHtml(path) + '" value="' + escapeHtml(value) + '">';
  }

  function timeEditor(label, path, value) {
    return '<label class="cut-time-field"><span class="cut-time">' + escapeHtml(label) +
      '</span>' + numberEditor(path, value) + "</label>";
  }

  function labelledEditor(label, path, value, extraClass, rows) {
    return '<span class="cell-label">' + escapeHtml(label) + "</span>" +
      textareaEditor(path, value, extraClass, rows);
  }

  function getActivePackage() {
    return state.packages[currentNo()] || null;
  }

  function renderBoard() {
    var script = currentScript();
    var no = currentNo();
    var pkg = state.packages[no];
    if (!pkg || !pkg.stories || !pkg.stories[0]) {
      dom.boardSubtitle.textContent = "剧本" + no + "尚未生成合格故事板。";
      dom.boardContent.className = "empty-board";
      dom.boardContent.textContent = String(script.text || "").trim()
        ? "请先完成精简草案检查，并在第五步确认生成故事板。"
        : "请先在上方识别剧本" + no + "。";
      return;
    }

    var story = pkg.stories[0];
    dom.boardSubtitle.textContent = "剧本" + no + "《" + story.title + "》 · " +
      (mode === "short" ? "短篇" : "长篇") + (state.stale[no] ? " · 源剧本已变化，请重新生成" : "");
    dom.boardContent.className = "";

    if (story.status === "return_to_script") {
      dom.boardContent.innerHTML =
        '<div class="board-meta">' +
          metaItem("剧本", "剧本" + no + "《" + story.title + "》") +
          metaItem("模式", mode === "short" ? "短篇" : "长篇") +
          metaItem("状态", "退回Step06") +
          metaItem("镜头", "0 Cut") +
        '</div>' +
        '<div class="return-panel"><strong>退回Step06</strong><p>' +
        escapeHtml(story.return_reason || "剧本缺少制作故事板所需信息。") +
        "</p><p>页面不会替GPT补写核心反转、关键动作或完整台词。</p></div>";
      return;
    }

    var shots = Array.isArray(story.shots) ? story.shots : [];
    var targetWords = Array.isArray(story.target_words) && story.target_words.length
      ? story.target_words.join(" / ") : "未提供";
    var html =
      '<div class="board-meta">' +
        metaItem("剧本", "剧本" + no + "《" + story.title + "》") +
        metaItem("模式与画幅", (mode === "short" ? "短篇" : "长篇") + " · " + (state.settings.aspectRatio || "16:9")) +
        metaItem("时长与镜头", story.total_duration_sec + "秒 · " + shots.length + " Cut") +
        metaItem("台词目标词", targetWords) +
      '</div>' +
      '<div class="board-scroll"><table class="storyboard-table">' +
      "<thead><tr>" +
        "<th>镜头及时序</th>" +
        "<th>分镜图（草图）</th>" +
        "<th>运镜、景别</th>" +
        "<th>内容 / 动作 / 台词 / 音效</th>" +
      "</tr></thead><tbody>";

    shots.forEach(function (shot, index) {
      var prefix = "shots." + index + ".";
      var sketchKey = imageKey(mode, no, index);
      html += "<tr>" +
        "<td>" +
          '<div class="cut-heading">' +
            textareaEditor(prefix + "cut", shot.cut, "compact", 1) +
            '<div class="cut-time-grid">' +
              timeEditor("开始（秒）", prefix + "start_sec", shot.start_sec) +
              timeEditor("结束（秒）", prefix + "end_sec", shot.end_sec) +
            "</div>" +
          "</div>" +
          labelledEditor("动作推进", prefix + "action_progression",
            shot.action_progression || shot.story_function || "", "", 4) +
          labelledEditor("剧情功能", prefix + "story_function", shot.story_function, "", 3) +
        "</td>" +
        "<td>" +
          '<div class="sketch-frame" data-aspect="' + escapeHtml(state.settings.aspectRatio || "16:9") +
            '" data-sketch-key="' + escapeHtml(sketchKey) + '">' +
            '<img alt="Cut ' + (index + 1) + '本地草图预览">' +
            '<div class="sketch-placeholder">尚未上传草图<br>可先按下方描述绘制或生成</div>' +
          "</div>" +
          '<div class="upload-row no-print">' +
            '<input type="file" accept="image/*" data-upload-index="' + index + '" aria-label="上传Cut ' + (index + 1) + '草图">' +
            '<button type="button" class="small ghost" data-remove-image="' + index + '">移除草图</button>' +
          "</div>" +
          '<span class="cell-label">黑白草图生成描述（文生图）</span>' +
          '<span class="cell-hint">用于单一首帧或关键帧：写清构图、角色姿态、道具状态和前中后景，不混写多个时刻。</span>' +
          textareaEditor(prefix + "sketch_prompt", shot.sketch_prompt, "sketch-prompt-editor", 8) +
        "</td>" +
        "<td>" +
          labelledEditor("景别", prefix + "shot_size", shot.shot_size, "compact", 2) +
          labelledEditor("运镜", prefix + "camera_move", shot.camera_move, "", 4) +
        "</td>" +
        "<td>" +
          labelledEditor("主体", prefix + "subject", shot.subject, "", 3) +
          labelledEditor("场景", prefix + "scene", shot.scene, "", 3) +
          labelledEditor("动作/描述", prefix + "action_description", shot.action_description, "", 5) +
          renderDialogues(shot.dialogue, prefix) +
          labelledEditor("音效", prefix + "sound", shot.sound, "", 3) +
          '<span class="cell-label">连续性</span>' +
          labelledEditor("开始状态", prefix + "continuity.start_state", shot.continuity && shot.continuity.start_state, "compact", 2) +
          labelledEditor("结束状态", prefix + "continuity.end_state", shot.continuity && shot.continuity.end_state, "compact", 2) +
          labelledEditor("下一镜连接", prefix + "continuity.next_connection", shot.continuity && shot.continuity.next_connection, "compact", 2) +
          '<details class="seedance-details">' +
            "<summary>展开单镜 Seedance Prompt</summary>" +
            '<div class="seedance-body">' +
              textareaEditor(prefix + "seedance_prompt", shot.seedance_prompt, "", 7) +
              '<div class="seedance-actions no-print">' +
                '<button type="button" class="small ghost" data-rebuild-seedance="' + index + '">重建本镜</button>' +
                '<button type="button" class="small secondary" data-copy-seedance="' +
                  index + '">复制本镜Prompt</button></div>' +
            "</div>" +
          "</details>" +
        "</td>" +
      "</tr>";
    });
    html += "</tbody></table></div>";
    dom.boardContent.innerHTML = html;
    loadSketchImages(no, shots.length);
  }

  function metaItem(label, value) {
    return '<div class="meta-item"><span class="meta-label">' + escapeHtml(label) +
      '</span><span class="meta-value">' + escapeHtml(value) + "</span></div>";
  }

  function renderDialogues(dialogues, prefix) {
    var html = '<span class="cell-label">台词/字幕</span>';
    if (!Array.isArray(dialogues) || dialogues.length === 0) {
      return html + '<div class="dialogue-row">本镜无台词</div>';
    }
    dialogues.forEach(function (dialogue, index) {
      var path = prefix + "dialogue." + index + ".";
      html += '<div class="dialogue-row"><div class="dialogue-grid">' +
        textareaEditor(path + "speaker", dialogue.speaker, "compact", 1) +
        textareaEditor(path + "line", dialogue.line, "compact", 2) +
        '<div class="subtitle-editor">' +
          labelledEditor("字幕", path + "subtitle", dialogue.subtitle, "compact", 2) +
        "</div></div></div>";
    });
    return html;
  }

  function setNestedValue(object, path, value) {
    var parts = String(path).split(".");
    var cursor = object;
    for (var i = 0; i < parts.length - 1; i += 1) {
      var key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      if (cursor[key] == null) cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cursor = cursor[key];
    }
    var last = /^\d+$/.test(parts[parts.length - 1])
      ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
    cursor[last] = value;
  }

  function handleBoardEdit(target) {
    var path = target.getAttribute("data-edit-path");
    if (!path) return;
    var pkg = getActivePackage();
    if (!pkg || !pkg.stories || !pkg.stories[0]) return;
    var value = target.getAttribute("data-value-type") === "number"
      ? Number(target.value) : target.value;
    setNestedValue(pkg.stories[0], path, value);
    var no = currentNo();
    var check = validatePackage(pkg, {
      mode: mode,
      storyNo: no,
      cutPolicy: state.settings.cutPolicy
    });
    var vocabularyCheck = validateStoryboardVocabulary(
      pkg, vocabularyContext, root.VOCABULARY_WHITELIST_DATA, root.VocabularyGuard
    );
    state.validation[no] = {
      valid: check.valid && vocabularyCheck.valid,
      errors: (check.errors || []).concat(vocabularyCheck.errors || []),
      warnings: check.warnings,
      returned: pkg.stories[0].status === "return_to_script"
    };
    renderTabs();
    scheduleSave();
  }

  function imageKey(currentMode, storyNo, index) {
    return currentMode + ":" + storyNo + ":" + (index + 1);
  }

  function openImageDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        reject(new Error("当前浏览器不支持IndexedDB。"));
        return;
      }
      var request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB打开失败。")); };
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openImageDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function idbPut(key, blob) {
    return openImageDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(blob, key);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function idbDelete(key) {
    return openImageDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(key);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function clearModeImages(clearMode) {
    var prefix = clearMode + ":";
    Array.from(memoryImages.keys()).forEach(function (key) {
      if (key.indexOf(prefix) === 0) memoryImages.delete(key);
    });
    return openImageDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(DB_STORE, "readwrite");
        var store = transaction.objectStore(DB_STORE);
        var request = store.openCursor();
        request.onsuccess = function () {
          var cursor = request.result;
          if (!cursor) return;
          if (String(cursor.key).indexOf(prefix) === 0) cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
      });
    }).catch(function () {
      return undefined;
    });
  }

  function findSketchFrame(key) {
    var frames = document.querySelectorAll("[data-sketch-key]");
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].getAttribute("data-sketch-key") === key) return frames[i];
    }
    return null;
  }

  function showSketchBlob(key, blob) {
    var frame = findSketchFrame(key);
    if (!frame || !blob) return;
    if (objectUrls[key]) root.URL.revokeObjectURL(objectUrls[key]);
    var url = root.URL.createObjectURL(blob);
    objectUrls[key] = url;
    var image = frame.querySelector("img");
    var placeholder = frame.querySelector(".sketch-placeholder");
    image.src = url;
    image.style.display = "block";
    frame.classList.add("has-image");
    if (placeholder) placeholder.style.display = "none";
  }

  function clearSketchPreview(key) {
    var frame = findSketchFrame(key);
    if (objectUrls[key]) {
      root.URL.revokeObjectURL(objectUrls[key]);
      delete objectUrls[key];
    }
    if (!frame) return;
    var image = frame.querySelector("img");
    var placeholder = frame.querySelector(".sketch-placeholder");
    image.removeAttribute("src");
    image.style.display = "none";
    frame.classList.remove("has-image");
    if (placeholder) placeholder.style.display = "";
  }

  function loadSketchImages(storyNo, count) {
    for (var i = 0; i < count; i += 1) {
      (function (index) {
        var key = imageKey(mode, storyNo, index);
        if (memoryImages.has(key)) {
          showSketchBlob(key, memoryImages.get(key));
          return;
        }
        idbGet(key).then(function (blob) {
          if (blob && mode + ":" + currentNo() + ":" + (index + 1) === key) showSketchBlob(key, blob);
        }).catch(function () {
          /* IndexedDB不可用时保留本次会话预览 */
        });
      }(i));
    }
  }

  function uploadSketch(index, file) {
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) {
      showToast("请选择图片文件。");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("单张草图不能超过8MB。");
      return;
    }
    var key = imageKey(mode, currentNo(), index);
    memoryImages.set(key, file);
    showSketchBlob(key, file);
    idbPut(key, file).then(function () {
      showToast("草图已保存在当前浏览器。");
    }).catch(function () {
      showToast("草图仅在本次会话预览，浏览器未能持久保存。");
    });
  }

  function removeSketch(index) {
    var key = imageKey(mode, currentNo(), index);
    memoryImages.delete(key);
    clearSketchPreview(key);
    idbDelete(key).catch(function () { return undefined; });
    showToast("已移除本镜草图。");
  }

  function copyVocabularyRepairPrompt() {
    renderVocabularyRepairControls();
    var prompt = String(dom.vocabularyRepairPromptOutput.value || "").trim();
    if (!prompt) {
      showToast("当前剧本没有可复制的白名单返修Prompt。");
      return;
    }
    copyText(prompt, "当前剧本返修Prompt已复制；可粘贴到新的GPT对话，无需读取Excel。");
  }
  function replaceCurrentWithRevision() {
    var no = currentNo();
    var raw = String(dom.revisedScriptInput.value || "").trim();
    if (!raw) {
      showToast("请先粘贴当前剧本的完整修正版。");
      return;
    }
    if (raw === "白名单表达不可行，需要重新设计该句。") {
      setStatus(dom.vocabularyRepairSummary, "error", "当前句子无法在白名单内保持原意，原剧本未被覆盖。", [
        "请返回故事生产工具重新设计该句，再粘贴完整修正版进行复检。"
      ]);
      showToast("白名单表达不可行，原剧本保持不变。");
      return;
    }
    var parsed = splitScripts(raw);
    var replacements = parsed.scripts.filter(function(script) {
      return !!String(script.text || "").trim();
    });
    if (replacements.length !== 1 || replacements[0].storyNo !== no) {
      showToast("修正版必须只包含当前剧本" + no + "的完整标题和正文。");
      return;
    }
    var combined = state.scripts.map(function(script) {
      return script.storyNo === no ? replacements[0].text : script.text;
    }).filter(function(text) {
      return !!String(text || "").trim();
    }).join("\n\n");
    state.vocabularyRepairDrafts[no] = "";
    dom.revisedScriptInput.value = "";
    dom.scriptsInput.value = combined;
    parseScriptsFromInput();
    showToast("剧本" + no + "已替换并重新执行词汇检查。");
  }

  function generateCurrentPrompt() {
    var script = currentScript();
    var no = currentNo();
    try {
      refreshVocabularyContextFromStorage();
      if (!currentVocabularyCheckReady()) {
        throw new Error("当前选中剧本尚未通过当前任务的词汇白名单检查。");
      }
      var data = root.STORYBOARD_PROMPT_DATA;
      var basePrompt = data && typeof data.content === "string" ? data.content : "";
      var prompt = buildPrompt({
        basePrompt: basePrompt,
        mode: mode,
        story: script,
        settings: state.settings
      });
      prompt += vocabularyPromptLock(vocabularyContext, state.vocabularyScope.source);
      state.promptDrafts[no] = prompt;
      dom.promptOutput.value = prompt;
      updateVocabularyPromptGate();
      saveNow();
      showToast("剧本" + no + "的精简Prompt已生成。" +
        (state.vocabularyScope.source === "manual" ? "可以直接复制给GPT。" : "请复制回原生产流程GPT对话。"));
    } catch (error) {
      showToast(error.message || "Prompt生成失败。");
    }
  }

  function currentInspectionExpected() {
    var script = currentScript();
    return {
      mode: mode,
      storyNo: currentNo(),
      title: script.title || "剧本" + currentNo(),
      cutPolicy: state.settings.cutPolicy,
      settings: Object.assign({}, state.settings)
    };
  }

  function inspectCurrentJson(raw, sourceKind) {
    var no = currentNo();
    if (sourceKind === "repaired") state.repairedDrafts[no] = String(raw || "");
    else state.jsonDrafts[no] = String(raw || "");

    var result = inspectStoryboardInput(raw, currentInspectionExpected());
    if (result.valid && result.package) {
      var vocabularyCheck = validateStoryboardVocabulary(
        result.package, vocabularyContext, root.VOCABULARY_WHITELIST_DATA, root.VocabularyGuard
      );
      if (!vocabularyCheck.valid) {
        result.valid = false;
        result.errors = (result.errors || []).concat(vocabularyCheck.errors);
        result.package = null;
      }
    }
    state.repairReports[no] = {
      valid: result.valid,
      sourceSchema: result.sourceSchema,
      repairs: result.repairs || [],
      errors: result.errors || [],
      warnings: result.warnings || []
    };
    state.repairedDrafts[no] = result.repairedText || String(raw || "");
    dom.repairedJsonOutput.value = state.repairedDrafts[no];
    if (result.valid && result.package) {
      state.pendingPackages[no] = safeClone(result.package);
    } else {
      delete state.pendingPackages[no];
    }
    renderJsonStatus(no);
    renderTabs();
    saveNow();
    showToast(result.valid ? "安全纠错通过，请确认生成故事板。" : "仍有不能安全自动修复的问题。");
    return result;
  }

  function checkAndRepairJson() {
    var raw = dom.jsonInput.value;
    if (!String(raw || "").trim()) {
      showToast("请先粘贴GPT返回的精简分镜JSON。");
      return;
    }
    inspectCurrentJson(raw, "raw");
  }

  function revalidateRepairedJson() {
    var repaired = dom.repairedJsonOutput.value;
    if (!String(repaired || "").trim()) {
      showToast("当前没有可重新校验的修复草案。");
      return;
    }
    inspectCurrentJson(repaired, "repaired");
  }

  function copyCorrectionPrompt() {
    var no = currentNo();
    var report = state.repairReports[no] || {};
    var source = String(dom.repairedJsonOutput.value || "").trim() ||
      String(dom.jsonInput.value || "").trim();
    if (!source) {
      showToast("当前没有待纠错的草案。");
      return;
    }
    var prompt = buildCorrectionPrompt(source, report.errors || [], currentInspectionExpected());
    copyText(prompt, "精简纠错Prompt已复制。");
  }

  function confirmPendingBoard() {
    var no = currentNo();
    var pending = state.pendingPackages[no];
    if (!pending) {
      showToast("当前没有通过安全纠错的待确认故事板。");
      return;
    }
    var check = validatePackage(pending, {
      mode: mode,
      storyNo: no,
      cutPolicy: state.settings.cutPolicy
    });
    var vocabularyCheck = validateStoryboardVocabulary(
      pending, vocabularyContext, root.VOCABULARY_WHITELIST_DATA, root.VocabularyGuard
    );
    if (!check.valid || !vocabularyCheck.valid) {
      state.repairReports[no] = {
        valid: false,
        sourceSchema: DRAFT_SCHEMA_VERSION,
        repairs: (state.repairReports[no] && state.repairReports[no].repairs) || [],
        errors: (check.errors || []).concat(vocabularyCheck.errors || []),
        warnings: check.warnings
      };
      delete state.pendingPackages[no];
      renderJsonStatus(no);
      renderTabs();
      saveNow();
      showToast("确认前复核失败，请查看第五步。");
      return;
    }
    state.packages[no] = safeClone(pending);
    state.validation[no] = {
      valid: true,
      errors: [],
      warnings: check.warnings || [],
      returned: false
    };
    state.sourceHashes[no] = textHash(currentScript().text);
    state.stale[no] = false;
    if (state.repairReports[no]) state.repairReports[no].confirmed = true;
    delete state.pendingPackages[no];
    renderJsonStatus(no);
    renderTabs();
    renderBoard();
    saveNow();
    showToast("故事板已生成并保存。");
    var boardCard = document.getElementById("boardCard");
    if (boardCard && boardCard.scrollIntoView) boardCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyText(value, successMessage) {
    var text = String(value || "");
    if (!text.trim()) {
      showToast("当前没有可复制的内容。");
      return Promise.resolve(false);
    }
    if (root.navigator.clipboard && root.isSecureContext) {
      return root.navigator.clipboard.writeText(text).then(function () {
        showToast(successMessage || "已复制。");
        return true;
      }).catch(function () {
        return fallbackCopy(text, successMessage);
      });
    }
    return fallbackCopy(text, successMessage);
  }

  function fallbackCopy(text, successMessage) {
    var helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
    document.body.removeChild(helper);
    showToast(ok ? (successMessage || "已复制。") : "复制失败，请手动选择文本复制。");
    return Promise.resolve(ok);
  }

  function rebuildCurrentSeedance(index) {
    var pkg = getActivePackage();
    if (!pkg) {
      showToast("当前没有可重建的故事板。");
      return;
    }
    rebuildSeedancePrompts(pkg, state.settings, index);
    renderBoard();
    saveNow();
    showToast("Cut " + (index + 1) + "的Seedance Prompt已按当前内容重建。");
  }

  function rebuildAllSeedance() {
    var pkg = getActivePackage();
    if (!pkg) {
      showToast("当前没有可重建的故事板。");
      return;
    }
    rebuildSeedancePrompts(pkg, state.settings);
    renderBoard();
    saveNow();
    showToast("全部Seedance Prompt已按当前设置和镜头内容重建。");
  }

  function copyCurrentStoryJson() {
    var pkg = getActivePackage();
    if (!pkg) {
      showToast("当前剧本还没有合格JSON。");
      return;
    }
    copyText(JSON.stringify(pkg, null, 2), "当前故事板JSON已复制。");
  }

  function clearCurrentMode() {
    var label = mode === "short" ? "短篇" : "长篇";
    if (!root.confirm("确定清空" + label + "模式的六个剧本、Prompt、JSON、故事板和本地草图吗？此操作不能撤销。")) return;
    try { root.localStorage.removeItem(STORAGE_PREFIX + mode); } catch (error) { /* ignore */ }
    clearModeImages(mode);
    state = defaultModeState(mode);
    syncFormFromState();
    showToast(label + "模式已清空；另一模式不受影响。");
  }

  function preparePrint() {
    if (printSnapshot) return;
    printSnapshot = {
      textareas: [],
      details: []
    };
    Array.prototype.forEach.call(document.querySelectorAll("textarea"), function (textarea) {
      printSnapshot.textareas.push({
        node: textarea,
        height: textarea.style.height,
        overflow: textarea.style.overflow
      });
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
      textarea.style.overflow = "visible";
    });
    Array.prototype.forEach.call(document.querySelectorAll(".seedance-details"), function (details) {
      printSnapshot.details.push({ node: details, open: details.open });
      details.open = true;
    });
  }

  function restoreAfterPrint() {
    if (!printSnapshot) return;
    printSnapshot.textareas.forEach(function (item) {
      item.node.style.height = item.height;
      item.node.style.overflow = item.overflow;
    });
    printSnapshot.details.forEach(function (item) {
      item.node.open = item.open;
    });
    printSnapshot = null;
  }

  function printBoard() {
    if (!getActivePackage()) {
      showToast("当前没有可打印的故事板。");
      return;
    }
    preparePrint();
    root.print();
  }

  function bindEvents() {
    dom.vocabularySourceRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (radio.checked) selectVocabularySource(radio.value);
      });
    });
    [dom.manualVocabLevel, dom.manualBasicRange, dom.manualAdvancedGroup, dom.manualTargetWords].forEach(function (input) {
      input.addEventListener("input", editManualVocabularyRange);
    });
    dom.applyVocabularyRangeButton.addEventListener("click", applyManualVocabularyRange);
    dom.modeRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (radio.checked) switchMode(radio.value);
      });
    });
    dom.parseScriptsButton.addEventListener("click", parseScriptsFromInput);
    dom.clearModeButton.addEventListener("click", clearCurrentMode);
    dom.scriptsInput.addEventListener("input", function () {
      state.rawScripts = dom.scriptsInput.value;
      state.vocabularyReport = null;
      renderVocabularyGuard();
      scheduleSave();
    });
    dom.scriptTabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-index]");
      if (button) selectStory(Number(button.getAttribute("data-index")));
    });

    [
      ["aspectRatio", "aspectRatio"], ["cutPolicy", "cutPolicy"],
      ["sketchStyle", "sketchStyle"], ["animationStyle", "animationStyle"],
      ["sceneStyle", "sceneStyle"], ["extraLimits", "extraLimits"]
    ].forEach(function (pair) {
      var element = dom[pair[0]];
      var update = function () {
        state.settings[pair[1]] = element.value;
        var no = currentNo();
        if (state.pendingPackages[no] && pair[1] !== "cutPolicy") {
          rebuildSeedancePrompts(state.pendingPackages[no], state.settings);
        }
        if (pair[1] === "cutPolicy") {
          var pkg = getActivePackage();
          if (pkg) {
            var check = validatePackage(pkg, {
              mode: mode,
              storyNo: no,
              cutPolicy: state.settings.cutPolicy
            });
            state.validation[no] = {
              valid: check.valid,
              errors: check.errors,
              warnings: check.warnings,
              returned: !!(check.story && check.story.status === "return_to_script")
            };
          }
          if (state.pendingPackages[no] || (state.repairReports[no] && state.repairReports[no].valid)) {
            var previousRepairs = (state.repairReports[no] && state.repairReports[no].repairs) || [];
            delete state.pendingPackages[no];
            state.repairReports[no] = {
              valid: false,
              sourceSchema: DRAFT_SCHEMA_VERSION,
              repairs: previousRepairs,
              errors: ["镜头数量设置已变化，请使用修复后草案重新校验。"],
              warnings: []
            };
            renderJsonStatus(no);
          }
          renderTabs();
        }
        scheduleSave();
        if (pair[1] === "aspectRatio") renderBoard();
      };
      element.addEventListener("input", update);
      element.addEventListener("change", update);
    });

    dom.generatePromptButton.addEventListener("click", generateCurrentPrompt);
    dom.copyPromptButton.addEventListener("click", function () {
      refreshVocabularyContextFromStorage();
      if (!currentVocabularyCheckReady()) {
        renderVocabularyGuard();
        showToast("当前选中剧本必须先通过词汇白名单检查。");
        return;
      }
      if (!isSafePrompt(dom.promptOutput.value, vocabularyContext)) {
        showToast("当前是旧版Prompt，请先点击“生成精简Prompt”。");
        return;
      }
      copyText(dom.promptOutput.value, state.vocabularyScope.source === "manual"
        ? "精简Prompt已完整复制，可直接粘贴给GPT。" : "精简Prompt已完整复制，请粘贴回原生产流程GPT对话。");
    });
    dom.promptOutput.addEventListener("input", function () {
      state.promptDrafts[currentNo()] = dom.promptOutput.value;
      updateVocabularyPromptGate();
      scheduleSave();
    });
    dom.copyVocabularyRepairButton.addEventListener("click", copyVocabularyRepairPrompt);
    dom.revisedScriptInput.addEventListener("input", function () {
      state.vocabularyRepairDrafts[currentNo()] = dom.revisedScriptInput.value;
      dom.replaceRevisedScriptButton.disabled = !String(dom.revisedScriptInput.value || "").trim();
      scheduleSave();
    });
    dom.replaceRevisedScriptButton.addEventListener("click", replaceCurrentWithRevision);
    dom.jsonInput.addEventListener("input", function () {
      var no = currentNo();
      state.jsonDrafts[no] = dom.jsonInput.value;
      delete state.pendingPackages[no];
      delete state.repairReports[no];
      renderJsonStatus(no);
      scheduleSave();
    });
    dom.repairedJsonOutput.addEventListener("input", function () {
      var no = currentNo();
      state.repairedDrafts[no] = dom.repairedJsonOutput.value;
      delete state.pendingPackages[no];
      delete state.repairReports[no];
      renderJsonStatus(no);
      renderTabs();
      scheduleSave();
    });
    dom.renderJsonButton.addEventListener("click", checkAndRepairJson);
    dom.revalidateButton.addEventListener("click", revalidateRepairedJson);
    dom.copyCorrectionPromptButton.addEventListener("click", copyCorrectionPrompt);
    dom.confirmBoardButton.addEventListener("click", confirmPendingBoard);
    dom.rebuildAllSeedanceButton.addEventListener("click", rebuildAllSeedance);
    dom.copyStoryJsonButton.addEventListener("click", copyCurrentStoryJson);
    dom.printButton.addEventListener("click", printBoard);
    dom.printTopButton.addEventListener("click", printBoard);

    dom.boardContent.addEventListener("input", function (event) {
      if (event.target.hasAttribute("data-edit-path")) handleBoardEdit(event.target);
    });
    dom.boardContent.addEventListener("change", function (event) {
      if (event.target.hasAttribute("data-upload-index")) {
        uploadSketch(Number(event.target.getAttribute("data-upload-index")), event.target.files[0]);
        event.target.value = "";
      }
    });
    dom.boardContent.addEventListener("click", function (event) {
      var rebuildButton = event.target.closest("[data-rebuild-seedance]");
      if (rebuildButton) {
        rebuildCurrentSeedance(Number(rebuildButton.getAttribute("data-rebuild-seedance")));
        return;
      }
      var copyButton = event.target.closest("[data-copy-seedance]");
      if (copyButton) {
        var pkg = getActivePackage();
        var index = Number(copyButton.getAttribute("data-copy-seedance"));
        var shot = pkg && pkg.stories[0].shots[index];
        copyText(shot && shot.seedance_prompt, "本镜Seedance Prompt已复制。");
        return;
      }
      var removeButton = event.target.closest("[data-remove-image]");
      if (removeButton) removeSketch(Number(removeButton.getAttribute("data-remove-image")));
    });

    root.addEventListener("focus", function () {
      refreshVocabularyContextFromStorage();
      syncActiveDrafts();
      renderVocabularyGuard();
      scheduleSave();
    });
    root.addEventListener("beforeprint", preparePrint);
    root.addEventListener("afterprint", restoreAfterPrint);
    root.addEventListener("pagehide", saveNow);
  }

  function init() {
    collectDom();
    var requestedMode = "short";
    try {
      requestedMode = new URL(root.location.href).searchParams.get("mode") || "short";
    } catch (error) {
      requestedMode = "short";
    }
    mode = normalizeMode(requestedMode);
    state = loadModeState(mode);
    bindEvents();
    syncFormFromState();
  }

  var API = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DRAFT_SCHEMA_VERSION: DRAFT_SCHEMA_VERSION,
    normalizeMode: normalizeMode,
    normalizeStoryNo: normalizeStoryNo,
    modePolicy: modePolicy,
    defaultSettings: defaultSettings,
    textHash: textHash,
    splitScripts: splitScripts,
    stripJsonFences: stripJsonFences,
    describeJsonParseError: describeJsonParseError,
    safeRepairJson: safeRepairJson,
    isSafePrompt: isSafePrompt,
    validatePackage: validatePackage,
    validateAndNormalizeDraft: validateAndNormalizeDraft,
    draftToPackage: draftToPackage,
    inspectStoryboardInput: inspectStoryboardInput,
    composeSeedancePrompt: composeSeedancePrompt,
    rebuildSeedancePrompts: rebuildSeedancePrompts,
    buildCorrectionPrompt: buildCorrectionPrompt,
    buildPrompt: buildPrompt,
    validateStoryboardVocabulary: validateStoryboardVocabulary,
    parseFixedCutPolicy: parseFixedCutPolicy,
    vocabularyGateReady: vocabularyGateReady,
    vocabularyScriptGateReady: vocabularyScriptGateReady,
    buildManualVocabularyContext: buildManualVocabularyContext,
    vocabularyScopeContext: vocabularyScopeContext,
    vocabularyPromptLock: vocabularyPromptLock
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.StoryboardLogic = API;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this)));
