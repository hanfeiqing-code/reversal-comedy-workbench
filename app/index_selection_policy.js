"use strict";

/*
 * 词汇层级判定策略单独放在此文件：
 * 只有来源选择与当前4词完全一致，或4词能被离线Excel确定定位时，才建立上下文。
 * 未知词不得静默降级为basic。
 */
getSelectedVocabLevel = function () {
  var currentWords = getWords();
  var currentKey = normalizedSelectionKey(currentWords);
  var urlWords = getUrlWordsParam();
  var urlLevel = normalizeSelectionWord(
    getUrlParam("level") || getUrlParam("vocab_level")
  );

  if (
    currentKey &&
    normalizedSelectionKey(urlWords) === currentKey &&
    (urlLevel === "basic" || urlLevel === "advanced")
  ) {
    return urlLevel;
  }

  if (storedSelectionMatchesCurrentWords()) {
    var storedLevel = normalizeSelectionWord(storageGet("selected_vocab_level"));
    if (storedLevel === "basic" || storedLevel === "advanced") {
      return storedLevel;
    }
  }

  return inferVocabLevelFromWords(currentWords);
};
