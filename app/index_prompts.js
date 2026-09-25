"use strict";

function characterReferenceText(data) {
  var selected = data.selected_characters || data.characters || [];
  return "selected_characters:\n" + JSON.stringify(selected, null, 2) + "\n" +
    "角色信息来源：已上传character_library.xlsx，请按角色名称读取。";
}

function templateReferenceText(data) {
  var selected = data.selected_reversal_mechanisms || [];
  var compactSelected = [];
  for (var i = 0; i < selected.length; i++) {
    compactSelected.push({
      mechanism_id: selected[i].mechanism_id,
      mechanism_name: selected[i].mechanism_name
    });
  }
  var shortModeMeaning = data.story_mode === "short"
    ? "短篇机制模式解释：mode=all表示参考完整机制库，不是随机选择一个机制，也不得被残留selected列表收窄；只有mode=partial时才优先selected列表。\n"
    : "";
  return "reversal_mechanism_mode: " + data.templateMode + "\n" +
    "selected_reversal_mechanisms: " + JSON.stringify(compactSelected) + "\n" +
    shortModeMeaning +
    "允许多机制融合：" + (data.allowFusion ? "是" : "否") + "\n" +
    "允许自由反转：" + (data.allowFreeReversal ? "是" : "否") + "\n" +
    "机制详情来源：已上传reversal_mechanism_library.xlsx，请按mechanism_id读取。\n" +
    (data.story_mode === "short"
      ? "创作关系：目标词语义、角色欲望或二者融合都可启发故事；最终以角色魅力、视觉喜剧、因果公平和反转释放决定，不得退化为低价值词汇套题。"
      : "创作顺序：先建立删除全部英文后仍清楚有趣的角色目标、视觉冲突和反转，再从既有场景自然匹配目标词；不得为了目标词反向拼接故事。");
}

function layeredVocabRules(data) {
  var durationRule = data.story_mode === "long"
    ? "中长篇遵守90秒以上及三阶段因果推进规则，不得套用1分钟以内限制。"
    : "短篇遵守30—60秒（不超过1分钟）及单核心反转规则。";
  var storyCreationRule = data.story_mode === "short"
    ? "目标词语义可以启发故事，也可以在故事成立后自然承担表达；只有Step04最终分配的词进入成片，每个分配词须在既有事实中有自然语义和交流价值，无自然位置不得硬造。目标词不改变核心因果，儿童观看与故事质量优先，不得后置贴词或转换成教学场景。"
    : "先建立独立成立的有趣视觉故事，再把能自然进入既有场景的目标词用于真实交流；不得让目标词反向决定故事核心。";
  if (data.vocabLevel === "advanced") {
    return "\n高级词汇故事生成规则：\n" +
      "1. 当前目标词来自高级英语词汇表。\n" +
      "2. 默认孩子已经掌握全部基础英语词汇。\n" +
      "3. 基础词可以作为白名单内的自然交流与情节辅助。\n" +
      "4. " + storyCreationRule + "\n" +
      "5. 基础词不参与高级目标词学习统计。\n" +
      "6. 故事趣味、自然英语和白名单在正式准入时并列检查；" + durationRule;
  }
  if (data.vocabLevel === "basic") {
    return "\n当前为基础词汇任务。" + storyCreationRule + durationRule;
  }
  return "\n" + durationRule;
}

function sessionInitializationText(data) {
  var context = data.vocabularyContext;
  var isShort = data.story_mode === "short";
  if (isShort) {
    return "## 会话初始化协议（只在公共原则阶段执行）\n\n" +
      "本轮执行前，后台检查当前任务上下文是否连续有效，并检查以下7个Excel是否可读取：\n" +
      "1. master_vocab_basic_with_pos.xlsx\n" +
      "2. master_vocab_advanced.xlsx\n" +
      "3. character_library.xlsx\n" +
      "4. reversal_mechanism_library.xlsx\n" +
      "5. reversal_case_library.xlsx\n" +
      "6. funny_detail_library.xlsx\n" +
      "7. natural_kids_animation_expression_library.xlsx\n\n" +
      "浏览器已建立vocabulary-context-v1任务摘要：\n" +
      JSON.stringify({
        schema_version: context.schema_version,
        mode: context.mode,
        vocab_level: context.vocab_level,
        target_words: context.target_words,
        basic_rank_max: context.basic_rank_max,
        advanced_group_id: context.advanced_group_id,
        source_fingerprint: context.source_fingerprint,
        task_fingerprint: context.task_fingerprint
      }, null, 2) + "\n\n" +
      "你必须实际读取Excel建立本轮允许词集合，不要要求页面粘贴完整白名单。只在本Step00实际读取五个知识库：character_library.xlsx、reversal_mechanism_library.xlsx、reversal_case_library.xlsx、funny_detail_library.xlsx、natural_kids_animation_expression_library.xlsx；对自然表达库核对10个工作表名称（00_readme、01_taxonomy、expression_patterns、interaction_chains、animation_dialogue_style、comedy_reversal_expression、semantic_class_guidance、target_word_integration_guide、risks_and_checks、human_micro_examples）、版本、实际数据行数和字段，其他知识库同样逐库核对工作表名称、关键字段、记录数量和可用版本。若外部编排器没有提供这些实际核验结果，不得把模板文字当作READY，先补齐Step00上下文或按唯一BLOCKED协议路由。\n\n" +
      "成功时，仅在内部任务上下文中追加（前提是已实际读取并核验；由Step00/外部编排器写入）：\nknowledge_context_status:\nKNOWLEDGE_CONTEXT_READY（未完成实际核验时保持KNOWLEDGE_CONTEXT_UNVERIFIED）\n\nknowledge_source_fingerprint:\n仅记录文件名、工作表、字段、记录数量与版本摘要。\n以上信息属于内部上下文继承资产，用于Step01—Step06保持同一知识环境，不作为用户可见输出内容；模型不得凭模板自填READY。\n\n" +
      "正常情况下禁止输出VOCABULARY_CONTEXT_READY、knowledge_context_status、knowledge_source_fingerprint、Excel读取摘要、工作表扫描结果或字段核验报告。Step00仅在文件缺失、工作表错误或关键字段错误时输出既有VOCABULARY_CONTEXT_BLOCKED格式；Step01—Step06静默继承同一knowledge_source_fingerprint，不重复要求上传或逐步阻塞。";
  }
  var excelUploadText = "请确认本次仍在原Step00—06同一GPT对话，并且已经上传、可以读取以下6个Excel：\n" +
      "1. master_vocab_basic_with_pos.xlsx\n" +
      "2. master_vocab_advanced.xlsx\n" +
      "3. character_library.xlsx\n" +
      "4. reversal_mechanism_library.xlsx\n" +
      "5. reversal_case_library.xlsx\n" +
      "6. funny_detail_library.xlsx\n\n";
  var knowledgeInitializationText = "同时只在本Step00实际读取四个知识库：character_library.xlsx、reversal_mechanism_library.xlsx、reversal_case_library.xlsx、funny_detail_library.xlsx；逐库核对工作表名称、关键字段、记录数量和可用版本。成功时在原VOCABULARY_CONTEXT_READY结果中追加：\n";
  return "## 会话初始化协议（只在公共原则阶段执行）\n\n" +
    excelUploadText +
    "浏览器已建立vocabulary-context-v1任务摘要：\n" +
    JSON.stringify({
      schema_version: context.schema_version,
      mode: context.mode,
      vocab_level: context.vocab_level,
      target_words: context.target_words,
      basic_rank_max: context.basic_rank_max,
      advanced_group_id: context.advanced_group_id,
      source_fingerprint: context.source_fingerprint,
      task_fingerprint: context.task_fingerprint
    }, null, 2) + "\n\n" +
    "你必须实际读取Excel建立本轮允许词集合，不要要求页面粘贴完整白名单。\n\n" +
    knowledgeInitializationText +
    "knowledge_context_status: KNOWLEDGE_CONTEXT_READY（仅在实际核验后由Step00/外部编排器注入；否则为KNOWLEDGE_CONTEXT_UNVERIFIED）\n" +
    "knowledge_source_fingerprint: 仅记录文件名、工作表、字段、记录数量与版本摘要，不粘贴库正文；不得由模板自行声明READY。\n" +
    "只有Step00发现文件缺失、工作表或字段错误时才列出实际缺口；Step02—06静默继承同一knowledge_source_fingerprint，不重复要求上传或逐步阻塞。";
}

function taskCheckpointText(data) {
  var context = data.vocabularyContext;
  var inheritedKnowledge = data.story_mode === "short"
    ? [
      "knowledge_context_status：必须由Step00/外部编排器实际核验后只读注入，不作为用户可见输出；runtime不得自行宣称READY",
      "knowledge_source_fingerprint：由Step00/外部编排器实际核验后只读注入，不作为用户可见输出",
      "执行门禁：短篇公共原则、知识库与task_fingerprint必须由Step00/外部编排器实际核验后注入；runtime不得自行宣称READY。当前Step只输出本步骤规定资产。仅文件、工作表、关键字段或上下文缺失/错配时按既有BLOCKED停止，不得继承上一任务。"
    ]
    : [
      "knowledge_context_status：继承Step00的KNOWLEDGE_CONTEXT_READY",
      "knowledge_source_fingerprint：继承Step00返回值",
      "执行门禁：本对话公共原则必须已返回VOCABULARY_CONTEXT_READY，且task_fingerprint与本卡完全一致；否则停止，不得继承上一任务。知识库只在Step00验证一次，后续静默继承，不重复要求上传。"
    ];
  return [
    "## 本步任务检查点（当前对话显式传递）",
    "story_mode：" + data.story_mode,
    "创作模式：" + storyModeDisplayLabel(data.story_mode),
    "词组编号：" + data.groupId,
    "目标年龄：" + data.ageRange,
    "vocab_level：" + context.vocab_level,
    "target_words：" + JSON.stringify(context.target_words),
    "basic_rank_max：" + (context.basic_rank_max == null ? "null" : context.basic_rank_max),
    "advanced_group_id：" + (context.advanced_group_id == null ? "null" : context.advanced_group_id),
    "source_fingerprint：" + context.source_fingerprint,
    "task_fingerprint：" + context.task_fingerprint
  ].concat(inheritedKnowledge).join("\n");
}

function shortOutputVisibilityInstruction(step) {
  var contracts = {
    "01": "本步输出NATURAL_LANGUAGE_CONTRACT_READY状态及4个目标词的轻量用法边界和创意资源接口；每个自然义项须包含animation_communication_context、低价值使用风险、sense_priority_guidance、creative_entry_points、visual_comedy_anchor、semantic_creative_potential、learning_value和word_story_potential。资源子字段用短语或1—2句表达，不生成故事、节点、角色、场景、镜头或固定对白；READY不得代替逐词结果。",
    "02": "本步读取Step01六项创意资源、角色库、反转机制库和搞笑细节库，内部生成多个创意方向并淘汰低价值、同质化或弱反转方案，只输出S01—S12十二行9列精品候选。三种创意入口不设固定比例；目标词参与须同时有故事价值并符合Step01 natural-language-contract-v1，自然而无创意作用不得冒充驱动，无自然位置不硬造，儿童观看价值与故事质量优先。创意生成前先识别目标词间可能形成的自然语义关系，但这只用于拓宽创意意识：不得固定词对、预选最终组合或替Step04分词。内部以viewer_experience_signature和viewer_character_journey_signature比较观看体验与主角旅程，并执行儿童吸引力、喜剧发动机、反转价值和representative_potential_check准入。每个候选骨架成立后内部执行Target Word Story Carrying Potential Check：先看Semantic Story Value是否真实改变角色欲望、主动选择、冲突、视觉笑点、反转或儿童记忆点，再看Dialogue Carrying Potential是否天然具有至少两个不同交流目的的未来方向；两个动作、镜头、动作开始与完成、观察与描述结果或机械复述不等于两个方向。最后只在内部标记旗舰承载潜力、备用承载潜力、剧情增强潜力或弱承载，供候选池筛选使用；该标记不等于creative_role或Step04 Production等级，不增加九列表公开列、表外字段或隐藏交接资产。Target Word Dialogue Viability Check作为承载潜力子检查，继续验证角色表达理由、独立交流方向和儿童动画自然口语，但不生成英文对白、Production Node、次数计划或最终分词。每词至少进入3个不同候选、旗舰/备用/探索梯队只是搜索目标而非硬配额；自然供给不足时允许少于目标数量，先保留简单高质量候选，不得贴词、加道具、加规则或加第二故事线。随后内部执行Story Multi-Word Carrying Potential Check：不同词必须各自增强不同故事价值和交流方向，禁止同画面、同动作链、同状态、同信息换词或新增剧情硬塞；仅内部标记Multi_Word_Strong / Possible / Weak / None，不分配组合、不锁Top6、不传递资产。候选池优先形成至少6条Strong/Possible及多种双词关系；若本组真实义项天然难组合，可少于6，但不得低质量硬塞，且每词仍有多个自然候选、并保留足以供Step04搜索每篇2—3词组合的双词供给。优秀单词强承载故事可以保留，不要求所有故事双词化；仅在无法不牺牲故事质量地提供此供给时返回STEP02_MULTI_WORD_CANDIDATE_BLOCKED。核心反转写明结果、逻辑、回收依据和情绪释放；Step03继承主角欲望、配角立场、冲突来源、喜剧发动机和反转逻辑。禁止拆批、等待继续或为凑满12条降低质量。",
    "03": "本步是唯一动画生产资产层与视觉事实源，输出的是紧凑动画生产接口契约摘要，不是分析报告；九列采用短标签压缩，但Visual Asset Contract的事实完整性和唯一来源地位不变。完整继承并保护Step02的主角欲望、配角立场、冲突来源、喜剧发动机、目标词语义方向和反转逻辑，一次输出S01—S12十二行9列动画视觉资产契约表，每个story_id总长度目标≤350字（现为软目标，不能删空间拓扑和因果事实）。契约由核心视觉载体资产、S0→S1→可选升级→SF视觉变化资产、动作连续因果链、最大视觉释放与反转证明共同组成，并锁定载体变化边界、角色行动目的及反转回收的前置视觉线索；故事保护事实锁定具体不可改变事实。关键语言事件只写事件与对应状态，不判断目标词、交流作用或学习价值，后续自然表达素材适配交Step05。先确定视觉状态链，再匹配funny_detail_library中0—2条适合资源并绑定具体变化；不强制调用，原创表演更合适时优先原创。逐故事执行visual_asset_contract_check；禁止解释性段落、为填字段强造升级、拆批、等待继续、抽象补齐或漏项。",
    "04": "本步是AI儿童动画制片决策层：完成12选6、固定4目标词学习包组合优化、`story_id × target_word`生产资格判断，以及C01—C06导演故事卡交接。4词是不可删除、替换、淘汰或降级的固定资产；失败单位永远是承载关系，不是目标词。Step03九列是唯一视觉事实源，Step04不得补写或重新导演。按儿童观看吸引力35、喜剧反转价值35、目标词学习融合价值20、制作稳定性10完成12条评分；候选池为7—8条高价值且可组成固定词包的故事，不是按总分机械截断。形成候选池后、Top6价值排序前执行Candidate Pool Composition Check：必须至少存在一组可行六篇包，满足四词覆盖、每词2篇、每篇2—3词和全关系A/B；不足先回补/替换候选，不能先按故事分数锁Top6。内部建立Story-Word Production Matrix，并对每个关系仅执行一次Target Word Production Check：两个独立稳定语言生产空间均来自既有Step02故事与Step03视觉事实，具有不同交流目的、语言需求和反馈，保持Step01同一真实义项；不是同一动作链、结果复述、画面命名或同信息换说法；移除学习/检测任务后角色仍有真实开口需求，并能在不新增核心事实下支持至少2次有效角色英文发言。Production_A / Production_B可分配，Production_C / Production_None不得分配；Step04资格不得预支未来Step06的补充微情境来上调。Top6固定三步：先过滤不可生产组合，再比较儿童观看、喜剧反转、故事记忆和包级差异，最后锁定。Story Target Count Gate要求每篇只能分配2—3个不同固定词且所有关系均为A/B，单词故事不得混入；每个进入故事的词都须独立A/B，不存在免费附加词，第三词不能补覆盖且不挤压主要词。A/B评估与C卡在同一内部运行完成，不要求用户输入继续；C01—C06一次交给Step05/Step06。C卡固定3个身份字段+12个导演字段（共15字段）、每卡约260—380字：原导演摘要字段之外新增`目标词语言承载环境地图`。地图只压缩既有故事事实中的自然承载环境、角色行为、交流触发与可见反馈；它不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头，不公开内部资格证据。",
    "05": "本步是Natural Kids Animation Expression Bank Adapter（儿童动画自然英语表达素材库适配层），不是故事分析器、目标词检测器、Production Node层或最终对白层；只处理Step04已锁定的Top6，并把已确定的故事场景、角色关系、视觉事件和分词适配为可供Step06自由取舍的高质量表达参考。最高优先级：旧版语言机会与复杂分析卡结构全部失效；Step01—04内容只作为内部理解故事的隐式语境，不得在Step05输出中复述或展开。Step05读取Step04 C01—C06六张Top6导演故事卡，先校验3个身份字段与12个导演字段（共15字段）齐全，再结合Step02/03恢复场景与角色，从目标词融合方向读取最终2—3个分配词；`目标词语言承载环境地图`只作为既有故事事实中目标词可自然发生的隐式环境语境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头，Step05不得恢复、展开、验证或公开复述该地图。Step04内部生产资格证据不属于公开卡或Step05输入，Step05不恢复、展开或验证节点。公开输出严格采用Dialogue Reference Sheet式C01—C06，不得出现语言机会、视觉事件、故事阶段、说话角色与对象分析、角色目标、即时情绪、角色关系、为什么此刻说、反馈闭环、Dialogue Function、Natural Expression Asset、creative_role、language_support、语义作用或儿童记忆价值分析。仅在上游资产真实缺失、task_fingerprint/story_id冲突、语言context未就绪、表达库缺失/损坏/未进入knowledge_source_fingerprint，或Allowed Vocabulary及Step01契约客观无法支持每类最少5条及每个分配词固定3条合规参考时，按STEP05_DIALOGUE_ASSET_BLOCKED停止；不得把节点缺失作为Step05阻塞理由，也不自行补造节点、事件、角色、反馈或改分词。一次输出task_fingerprint和英语素材C01—C06；每份固定包含制作序号、story_id、标题、场景表达方向、角色语气参考、Natural Kids Animation Expression Examples、目标词自然融合参考、语言风险、白名单复核。场景表达方向用一句话或斜杠短语概括；每篇选择2—3个最相关真实动画场景分类，默认3类但不强行为凑数补类，每类提供5—10条、默认6条自然表达。逐一覆盖本篇Step04分配的2—3个目标词，每词输出适合语境和固定3条自然融合参考。优先依据natural_kids_animation_expression_library.xlsx的00—08工作表匹配表达类别、角色语气、长短句节奏和反转阶段风格；expression_patterns.example_expressions只作参考，须按当前故事、角色与Allowed Vocabulary重写，不原样批量复制；禁止读取或复制human_micro_examples正文、输出内部ID、按目标词字符串反查句子，资源库也不提供白名单、词义或词形授权。所有Examples必须自然、儿童动画可用、符合Step01和Allowed Vocabulary，可由Step06采用、组合、改写或不用；它们不是最终对白、固定模板、Production Node证明、出现次数素材或actual_entries来源。Step05不输出镜头、完整剧本、中文故事或目标词次数规划，也不修改剧情、角色、视觉资产、反转、Top6顺序或Step04分词。",
    "06": "本步是儿童动画总导演兼最终对白导演。Step01语言边界、Step02故事动力、Step03视觉事实、Step04最终分词与C卡`目标词语言承载环境地图`、Step05表达银行都服务于Step06创作；地图只帮助恢复既有故事事实中的目标词自然交流环境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头。Step06应优先依据地图恢复每个分配词在既有事实中的自然交流环境；地图不构成资格证明，Production Space Execution Check仍独立执行。Step05示例只供参考，不是最终对白、固定模板、Production Space证明、次数素材或actual_entries。Step06可综合上游资产自主统筹镜头、表演、微动作、互动、喜剧节奏和最终对白，并独立执行Production Space Execution Check。正式创作前执行紧凑的Production Space Execution Check：只有地图未覆盖足够的既有真实交流环境、经检查仍确认某词不足两个空间，且不改变Step02故事核心与Step03视觉事实/状态链时，Step06才可在核心事实边界内使用已有角色、已建立场景/资产和允许世界规则补充非核心微情境、互动节拍或镜头，让每处都有真实目的、对象、回应与可见反馈。不得改变核心剧情、反转、角色、关键资产、世界规则或Step03状态链。目标词容量、次数或初始空间不足绝不路由Step04或BLOCKED；BLOCKED只用于必需上游事实缺失或不可调和合同冲突。每篇固定2—3个不同目标词、每词至少2次有效角色英文发言；先创作自然儿童动画互动，再按视觉一致性、对白自然性、生产许可证三类验收。normal固定3+3输出；normal或成功Repair的每篇实际剧本都必须附带轻量成稿检查，逐行列出本篇完整2—3词的真实正文与有效发言次数。"
  };
  if (step === "06") {
    contracts[step] += " 当前版本接口覆盖：若最终分词关系意外为Production_C / Production_None，内部退回Step04重选；只有该分配契约错误可回Step04。词汇容量、次数或交流空间不足仍不得回Step04，须在既有事实边界内内部重导演并最终继续输出。Step06可补充的非核心交流节拍只能使用已建立的场景、角色、核心资产和世界规则，不能新增核心剧情、角色、道具、规则、冲突或第二故事线。";
  }
  if (step === "04") {
    contracts[step] += " Target Word Production Check只证明最低生产资格，不固定Node模板、英文句子、次数、位置或顺序。Step02承载潜力和多词健康仅作候选先验，不能替代逐格验证；形成7—8条候选池后先执行Candidate Pool Composition Check，候选池不能提供可行六篇学习包时先回补Step02候选、不得进入Top6价值排序。Story Target Count Gate要求每篇必须保持2—3个不同固定词且全关系为A/B，第二词不合格即重分配、换故事或重组Top6，单词故事不得混入；所有进入词都须独立A/B，不存在免费附加词。Step06可在核心事实边界内导演非核心互动，但该自由不得把Production_C / Production_None反向视为合格。最终Assignment Gate只复核四词覆盖、每词1篇A+另1篇A/B、Story Target Count Gate和全关系A/B；无法满足则STEP04_COVERAGE_BLOCKED。C卡固定3个身份字段+12个导演字段（共15字段）：入选价值、故事核心、主角动力、关键关系、喜剧发动机、儿童期待、反转释放、视觉记忆点、目标词融合方向、目标词语言承载环境地图、导演必须保持、导演自由发挥。地图仅描述既有故事事实中的自然承载环境、角色行为、交流触发与可见反馈；不是Production Node、语言机会卡、资格或生产证据、次数计划、固定对白或固定镜头。不得输出内部矩阵、等级、节点或次数证明。";
  } else if (step === "06") {
    contracts[step] += " Step04提供最终分词及C卡目标词语言承载环境地图；地图只帮助Step06恢复既有事实中的自然交流环境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头。Step06优先依据地图恢复每词既有真实交流环境，但地图不构成资格证明；Step06执行紧凑的Production Space Execution Check，不重建节点模板或公开空间证明，并独立决定最终对白、镜头、节奏与自然重复。只有地图未覆盖足够的既有真实交流环境、经检查仍不足两个空间，且不改变Step02故事核心与Step03视觉事实/状态链时，才可用已有角色、场景、资产和允许规则补充非核心微情境、互动节拍或镜头。补充空间必须具有新的真实目的、对象、回应与可见反馈，并以同一真实义项形成“说出→回应→变化”；同一动作链、状态、画面标签、复述或同一目的不能拆成双空间。目标词容量、正文次数或初始空间不足不得回Step04或BLOCKED，必须由Step06内部补充、重导演、复扫直至达标；BLOCKED只用于必需上游事实缺失或不可调和合同冲突。公开前以Step04完整2—3词列表全量扫描，每词不足2次即无许可证；normal和成功Repair的每篇实际剧本都必须附带轻量检查，逐行显示全部分配词的真实正文与有效发言次数。固定3+3与Repair边界不变。";
  }
  if (step === "06") {
    contracts[step] += " 语义优先复核：Production_C / Production_None只表示分配契约错误时才回Step04；将短缺区分为`final_dialogue_count/effective_speech_shortage`（双锚点已由Step04证明、仅成稿或漏记反馈不足，可由Step06局部修复）与`upstream_anchor_shortage`（双锚点未证明，必须内部回Step02/03或由Step04换候选）。非核心交流节拍只能复用已建立的场景、角色、核心资产和世界规则，不得新增核心剧情、角色、道具、规则、冲突或第二故事线；任何内部回退都必须继续完成并交付固定3+3成稿。";
  }
  return contracts[step] || "按当前步骤规定的轻量生产格式输出。";
}

// This compact runtime block is deliberately appended after the legacy visibility
// contracts.  Older strings are retained for compatibility with archived prompt
// snapshots, while this block states the current semantic priority unambiguously.
function shortGroundedSemanticGateText(step) {
  var common = "【短篇语义硬门（本块优先于任何旧版运行注入）】短篇默认世界为grounded_cartoon：儿童熟悉的现实场景＋有限卡通夸张；Step06正式剧本预计30—60秒且不得超过1分钟。移动或数量变化必须有可见起点、触发、路径、终点和限制；状态、表情或速度变化必须有可见起点、触发、结果和限制；禁止无限伸长/复制、无来源移动、穿越实体或凭空改变功能。可恢复逻辑或复杂度失败标记LOGIC_OR_COMPLEXITY_REJECTED并内部退回上游；不得向用户输出BLOCKED、no-output、半成品或空批次，也不得以任何同义措辞提前结束。仅必需上下文缺失或不可调和事实冲突仍可使用该步骤既有BLOCKED协议。Step01—Step05完整资产只在编排器内部交接，最终用户只接收Step06通过门禁后的固定3+3剧本。";
  var storyGate = "故事步骤才执行以下硬门：每篇只允许one_line_spine（一个主角主目标→一个阻碍→一个主动选择→一个可见反转/回收；配角可有服务主线的局部目标或限制），一个连续主场景、一个核心对象/机关，最多3名角色、2件辅助道具、1条规则、4次关键状态变化；核心对象按功能/类别计数，同类多实例只有首镜并排且比较本身是反转必要事实时才共享名额，不同功能对象分别计数，辅助道具不得兼任第二核心或新规则。首镜可同时建立必要的地点、角色和核心对象名词，首镜之后每镜最多引入一个新关键名词；每镜一个主导动作/变化。执行scene_graph_check、role_ledger_check、prop_necessity_check、complexity budget和silent_three_frame_check（别名：静音三帧测试、silent_scene_read）：不看英文也要能读出地点、谁要什么、谁在做什么、结果如何。角色动作还必须符合角色库的character_type、avoid_behavior、common_actions和prompt_instruction；辅助/高频配角不得临时承担多步骤主线。排除压脸、憋气、强行入水/设备和危险攀爬等可模仿风险动作。";
  var perStep = {
    "01": "Step01只登记有限、可拍摄的语义变化边界；不得把表面动作或夸张幻想当作自然义项，先锁定一个可视化、可复用的真实用法。",
    "02": "Step02先写一行故事骨架和角色主动选择，再扩展候选。每词至少3个候选及旗舰/备用/探索梯队只是搜索目标，不是牺牲故事质量的硬配额；不得为了覆盖某个词新增场景、角色、道具、规则、事件或第二故事线。候选不足时先内部重写/重试；STEP02_MULTI_WORD_CANDIDATE_BLOCKED仅是内部路由，不能作为用户可见停产结果，只有固定输入客观不可调和时才升级为阻塞。",
    "03": "Step03必须在首帧交代场景边界、角色相对位置、对象形状/大小/主人/用途/连接；每件道具写owner、purpose、initial_position、trigger、visible_path、endpoint。设备或舱体必须交代外形、进出、触发、路线和安全限制；每个story_id总长度≤350字是软目标，不得删掉空间拓扑和因果事实。",
    "04": "Step04在评分前执行独立盲看红队和逻辑一票否决；任一spine、拓扑、角色、道具必要性、有限物理规则、复杂度或静音理解失败，先回补Step02/03再重选，不得把形式合规当作可生产。A/B评估与C卡是同一运行内的内部两阶段，不要求用户输入继续；STEP04_CANDIDATE_REPLENISHMENT_REQUIRED和STEP04_COVERAGE_BLOCKED仅作内部路由，必须先重试/重组，只有固定事实不可调和才可对外阻塞。若最终分词关系意外为Production_C / Production_None，Step06可内部回到Step04重选；普通词汇容量不足不得借此路由。",
    "05": "Step05只能适配既有事实中的自然表达，不得用新名词、假定空间、解释性台词或堆叠表达类别掩盖上游逻辑缺口；发现缺口内部退回Step02/03。STEP05_DIALOGUE_ASSET_BLOCKED仅在穷尽合规改写后仍受上游白名单/上下文/资源固定冲突时使用，不得因可恢复的表达数量或自然度问题停产。",
    "06": "Step06必须接收最终Top6六行的完整Step02事实（主角欲望、阻碍、主动选择、角色立场、道具用途、核心反转/回收和目标词语义方向），不是只有三列摘要；每镜按shot_beat：位置（谁在哪）→动作（谁碰什么）→接触/路径（怎样碰、往哪走）→变化（对象怎样变）→反馈（谁因此怎样反应）。每次目标词发言都须有明确交流对象，且必须可回应（默认另一名角色，或上游明确建立能听懂并回应的有知觉对象）；普通物体、窗、池水和环境反馈不能单独充当listener或交流证据。normal创作或普通语义验收发现故事/角色/主线问题时用return_to_upstream: Step02，发现空间/资产/路径/状态问题时用return_to_upstream: Step03，发现最终分词关系意外为Production_C / Production_None时用return_to_upstream: Step04；先使旧下游锁定失效，再重跑受影响的Step03→Step04→Step05→Step06并继续内部循环。step06_mode=repair仅处理白名单、自然度、反馈或次数等局部失败，若暴露语义硬门则退出repair并切换normal上游恢复，不得被‘不得重跑上游’旧修复边界拦住。该回退必须最终仍输出固定3+3成稿，绝不向用户输出BLOCKED、no-output、半成品或空批次。"
  };
  var storySteps = { "02": true, "03": true, "04": true, "06": true };
  common += " 幻想/魔法只有用户明确要求时才可使用，且必须在首镜建立单一规则的来源、触发、范围、限制并通过独立盲审；grounded_cartoon不是额外放行入口。";
  // A production "space" is an exchange moment, not a reason to invent
  // another room, prop, event, state or shot. Keep this clarification in the
  // runtime tail as well as the canonical markdown prompts.
  storyGate += "已选角色池超过3名时只作候选池，每篇实际出场子集最多3名并写入role_ledger；固定场景边界如地面、桌面、水盆本体只建立空间、不另算道具，只有被操作/移动/触发反转的物件计入道具预算；交流空间是可观察、可复现的交流时刻/证据锚点，不等于新增地点、道具、事件、状态或镜头；同一连续场景、核心对象和状态链可承载多个空间，但目的、可回应listener和反馈必须不同。Step04必须先证明每个Production_A/B关系有两个既有锚点；Step06只能恢复地图/成稿漏记的已有锚点或反馈，每篇总计最多一个非核心beat（每词至多一个），不能新增事件/状态/镜头链或把Production_C/None升级；真实不足时退回Step02/03或由Step04换候选。";
  perStep["04"] += " 这里的空间是交流时刻而非新地点或道具；同一场景/对象可复用，只要目的、listener和反馈不同。盲审只看可见画面并逐项回答是/否＋依据，不接受作者解释。";
  perStep["06"] += " 交流空间不要求新增视觉空间；Step04的Production_A/B关系必须已经由既有Step02/03事实证明两个独立交流锚点，Step06只能恢复地图或成稿漏记的已有锚点/反馈，不能用补beat创造第二锚点或把C/None升级。将短缺分两类处理：`final_dialogue_count/effective_speech_shortage`表示双锚点已证实、只是成稿表达或漏记反馈不足，可走Step06局部修复；`upstream_anchor_shortage`表示Step04未证实两个锚点，必须回Step02/03或由Step04换候选。若确需补充，每篇总计最多一个非核心beat（每词至多一个），只能嵌入已有事件，不新增事件、状态或镜头链；真实锚点不足时无合法槽位不得硬写。兼容旧接口检索短语：仅当地图未覆盖足够的既有真实交流环境、独立检查仍确认某词不足两个空间，且不改变Step02故事核心与Step03视觉事实/状态链时，Step06才必须在“核心事实边界”内补充非核心微情境、互动节拍或镜头；当前仅允许上述一个beat，不得按旧宽泛措辞扩写。"
  if (step === "06") {
    perStep["06"] += " assignment_gate_status（内部只读元数据）必须由编排器随Step04矩阵及产物哈希交接：状态必须是ASSIGNMENT_READY，且覆盖谓词同时满足四词全覆盖、每词至少2篇、每篇2—3词、每词至少1篇Production_A+另1篇Production_A/B、无Production_C/None；缺失、非READY、哈希或task_fingerprint不符时先回查Step04，不得由模型猜测或自填。上游回退每条候选/路由最多内部重试3轮并记录route/revision_id/attempt/max_attempts=3；同一候选/修订每篇最多刷新2次（max_candidate_refreshes=2），候选池最多重建2次（max_pool_rebuilds=2），故事总池代数最多3代（max_pool_generations=3）。达到故事代数上限后丢弃该候选并从包级候选搜索中换故事；局部计数只能在记录新generation后重置，不能靠重置计数无限循环。RETRY_EXHAUSTED不向用户暴露，绝不输出no-output或半成品。以下限制覆盖本段较早的兼容措辞：Step04必须先证明两个既有交流锚点，Step06只能恢复地图/成稿漏记的锚点或反馈，每篇总计最多一个非核心beat；真实锚点不足时回Step02/03或由Step04换候选，不能用补拍升级Production_C/None。";
  }
  if (storySteps[step]) {
    common += "\n" + storyGate;
  } else if (step === "01") {
    common += "\nStep01只建立词义合同与有限变化边界，不生成故事、角色、场景、镜头或对白，也不执行scene_graph/role_ledger/prop_necessity故事检查。";
  } else if (step === "05") {
    common += "\nStep05只适配既有Top6事实的自然表达，不生成故事、角色、场景或新道具，也不代替上游执行scene_graph/role_ledger故事检查。";
  }
  return common + "\n" + (perStep[step] || "");
}

function commonTaskInputText(data) {
  return sessionInitializationText(data) + "\n\n" +
    "## 本轮创作配置（只在公共原则卡完整注入）\n\n" +
    "词组编号：" + data.groupId + "\n" +
    "目标年龄：" + data.ageRange + "\n" +
    characterReferenceText(data) + "\n" +
    templateReferenceText(data) + "\n" +
    "补充限制：" + data.extraLimits +
    layeredVocabRules(data);
}

function stepTaskInputText(promptId, data) {
  var normalizedPromptId = String(promptId || "");
  var match = normalizedPromptId.match(/_(0[1-6])_/);
  var step = match ? match[1] : "";
  var blocks = [taskCheckpointText(data)];

  if (data.story_mode === "short") {
    blocks.push(shortOutputVisibilityInstruction(step));
    blocks.push("本步遵循本Prompt末尾的‘末尾语义硬门（优先级最高）’；该块与其他步骤共用同一版本，不重复生成故事，也不让旧压缩说明覆盖它。");
  }

  if (step === "01") {
    blocks.push(
      data.story_mode === "short"
        ? "本步额外输入：从已上传主词表读取这4词的translation与pos，建立natural-language-contract-v1；每个自然义项公开语言安全边界、animation_communication_context、低价值使用风险、sense_priority_guidance、creative_entry_points、visual_comedy_anchor、semantic_creative_potential、learning_value和word_story_potential。优先从真实语义价值而非表面字面动作建立角色欲望、视觉冲突、喜剧机会和反转可能；资源子字段保持短语或1—2句，不生成故事、角色、场景、节点、镜头、重复方案或固定对白。"
        : "本步额外输入：从已上传主词表读取这4词的translation与pos，建立自然语言合同和创意语义资源地图；translation只作释义参考，可补充真实常用义。每个义项同时记录自然用法、semantic_creative_potential和word_story_potential，只说明可能触发的欲望、视觉冲突、关系或反转方向，不生成故事、角色、场景、节点或固定对白。"
    );
  } else if (step === "02") {
    blocks.push(characterReferenceText(data));
    if (data.story_mode === "short") {
      blocks.push(
        shortKnowledgeReferenceText(data, "02"),
        "Step02顺序硬门（优先于下方旧版压缩说明）：先对每个方向执行现实基线与复杂度检查（硬门）、one_line_spine、scene_graph_check、role_ledger_check、prop_necessity_check和静音三帧测试；未通过者不得进入任何目标词承载或多词健康检查。",
        "执行Step02源Prompt：读取Step01的sense_priority_guidance、creative_entry_points、visual_comedy_anchor、semantic_creative_potential、learning_value和word_story_potential；先识别目标词间可能的自然语义关系，只拓宽创意意识，不固定词对、不预选最终组合或替Step04分词；再结合角色、反转机制与搞笑细节。内部先扩展多个创意方向，再用精品准入检查淘汰低价值、同质化和弱反转方案；viewer_experience_signature、viewer_character_journey_signature及representative_potential_check只在内部执行，不输出或传递。每个候选骨架成立后执行Target Word Story Carrying Potential Check：分别检查Semantic Story Value与Dialogue Carrying Potential，并只在内部标记旗舰承载潜力、备用承载潜力、剧情增强潜力或弱承载；两个动作、镜头、动作首尾或观察与结果描述不能冒充两个交流方向。Target Word Dialogue Viability Check作为其子检查，确认真实角色表达理由、两个目的不同且反馈可区分的未来交流方向，以及儿童动画自然口语可行性。随后执行Story Multi-Word Carrying Potential Check：不同词须各自增强不同故事价值和交流方向；同画面、同动作链、同状态、同信息换词或新增剧情硬塞一律失败。仅内部标记Multi_Word_Strong / Possible / Weak / None；至少6条Strong/Possible是优先目标，真实义项天然难组合时允许少于6，但不得低质量硬塞，且每词仍有多个自然候选和尽量足以供Step04搜索2—3词组合的双词供给；自然成立的词对可以重复，但不得机械换皮。优秀单词强承载故事可保留，不要求所有故事双词化；只有无法不牺牲质量地提供此供给时才返回STEP02_MULTI_WORD_CANDIDATE_BLOCKED。该健康检查不分配最终组合、不锁Top6、不生成英文对白、Production Node、次数计划、公开字段或隐藏资产；上述潜力只作Step02筛选，也不替Step04完成最终资格判断或分词。每词3篇须形成至少1篇旗舰承载、1篇备用承载、1篇探索故事，其中旗舰与备用均可真正进入Top6；这些都是搜索目标，不得为达成数字新增剧情。只输出S01—S12九列表并逐词覆盖4词，不新增公开字段或对白；核心反转保留反转逻辑，Step03继承既有喜剧发动机事实。",
        "Step02配额解释：至少6条Strong/Possible、每词至少3个候选、至少2种自然语义方向及2种冲突或关系形式，以及每词3篇梯队，均只是优先搜索目标而不是硬配额；语义方向和冲突形式不得为满足数字给已有故事贴词、加道具、加规则或加第二故事线，真实义项难组合时先生成新的简单候选或保留高质量单词故事。",
        "单次输出要求：一次回复输出一张完整12行9列表。儿童兴趣与喜剧笑点、目标词语义创造价值、角色欲望与冲突、视觉喜剧和反转释放优先；每条须通过儿童吸引力、喜剧发动机和反转价值准入。复杂时压缩单元格，禁止拆批、请求继续、漏编号、漏列、漏词、用同上省略或为凑满12条降低质量。",
        "补充限制：" + data.extraLimits
      );
    } else {
      blocks.push(
        templateReferenceText(data),
        "补充限制：" + data.extraLimits,
        "创作顺序：先完成无需英文也成立的有趣视觉故事方向，再从既有场景自然匹配目标词。"
      );
    }
  } else if (step === "03") {
    if (data.story_mode === "short") {
      blocks.push(
        shortKnowledgeReferenceText(data, "03"),
        "上游输入：按story_id读取Step02九列并完整继承主角欲望与原因、关键配角立场、当前限制、冲突来源、喜剧发动机、主动选择、目标词语义方向及核心反转结果与逻辑。围绕既有喜剧来源建立视觉资产契约，不重新创作。Step03输出紧凑动画生产接口契约摘要而非分析报告；一次回复输出固定九列【story_id、情境建立、核心视觉载体资产、视觉变化资产、视觉喜剧与表演升级、最大视觉释放与反转证明、故事保护事实、动作连续因果链、关键语言事件】共12行，每个story_id总长度目标≤350字。九列和Visual Asset Contract完整性不变，视觉变化资产必须形成S0→S1→可选升级→SF连续链，不需要升级时不得为填字段强造变化。各单元格使用短标签和最短必要事实：核心载体写清初始、功能、允许变化、限制与喜剧作用；动作因果链压缩为目的→动作→接触→变化→结果→反转回收；反转证明压缩为期待→线索→释放→证明且静音可懂；故事保护事实只写具体保留与禁止项。关键语言事件只写事件与状态，不分析目标词、交流作用或学习价值，这些交Step05。禁止解释性段落、拆批、漏项、抽象补齐、替换核心对象或新增第二反转。",
        characterReferenceText(data),
        "补充限制：" + data.extraLimits
      );
    } else {
      blocks.push(
        characterReferenceText(data),
        templateReferenceText(data),
        "补充限制：" + data.extraLimits
      );
    }
  } else if (step === "04") {
    blocks.push(
      data.story_mode === "short"
        ? shortKnowledgeReferenceText(data, "04") + "\n\n上游输入：按`story_id`读取Step01用法边界、Step02十二条故事和Step03十二条完整九列视觉事实；Step03是唯一视觉事实源，Step04不得补写或重新导演。先按35/35/20/10评分，再建立覆盖固定4词的Story-Word Production Matrix。每个`story_id × target_word`仅执行一次Target Word Production Check：两个独立稳定空间来自既有Step02/03事实，具有不同目的、语言需求和反馈；不是同一动作链、结果复述、画面命名或同信息换说法；删除学习/检测任务后仍有真实开口需要，均保持Step01同一真实义项，并在不新增核心事实下支持每词至少2次有效发言。只允许Production_A / Production_B分配，Production_C / Production_None不得上调；Step06的后续非核心导演补充不能作为本步资格证据。形成7—8候选池后、Top6价值排序前，执行Candidate Pool Composition Check：先确认存在同时满足四词覆盖、每词2篇、每篇2—3词与全A/B关系的可行六篇包；不足先回补或替换候选，不能先锁Top6。随后再比较儿童观看/喜剧反转/故事记忆/包级差异并锁定：逐篇通过Story Target Count Gate（2—3词、全关系A/B、单词故事不得混入），每个进入词独立A/B，第三词不能补覆盖。通过后第一轮输出A+B；输入继续后一次输出C01—C06。C卡固定15字段（3个身份字段+12个导演字段）、约260—380字；新增`目标词语言承载环境地图`只压缩既有故事事实中的自然承载环境、角色行为、交流触发与可见反馈，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头；不公开矩阵、等级、证据、节点或次数。Step05仅作隐式表达语境消费，Step06保留独立导演与执行检查权。"
        : "上游输入：只使用本对话Step03的完整输出及Step01用法边界，不重新选择角色或反转机制；词义可在真实常用义范围内按故事语境选择。",
      "补充限制：" + data.extraLimits
    );
    if (data.story_mode === "short") {
      blocks.push("Step04内部只运行一次Target Word Production Check：每个`story_id × target_word`必须有两个来自既有Step02故事与Step03视觉事实的独立稳定语言空间；两处目的、语言需求和反馈不同，均保持Step01同一真实义项与真实开口必要性，并形成说出→回应→已有变化。视觉相关不等于语言空间：同一动作链、结果复述、画面命名、同信息换说法或单一空间重复均失败。Production_A / Production_B可分配，Production_C / Production_None不得分配。此检查只锁定最低资格，不固定最终英文、次数、位置或顺序；Step06可独立导演非核心互动，但其未来补充不能倒推上调本步弱关系。");
      blocks.push("固定学习包与交接：形成7—8候选池后先执行Candidate Pool Composition Check；若池内不存在满足四词覆盖、每词2篇、每篇2—3词、全关系A/B的可行六篇包，先回补/替换候选，不进入Top6价值排序。4词均不可淘汰；每词至少2篇（1篇A+另1篇A/B），逐篇通过Story Target Count Gate：每篇2—3词、所有关系A/B，单词故事不得混入；每个进入词都独立A/B，第三词不能作为补覆盖工具。Top6先过滤不可生产组合，再比较可行组合价值，最后锁定；失败关系重分配、换故事或重组，候选池仍不足才STEP04_COVERAGE_BLOCKED。第一轮A+B、继续后C01—C06不变；C卡固定3个身份字段+12个导演字段（共15字段）、约260—380字，字段含`目标词语言承载环境地图`。地图仅压缩既有事实中的自然承载环境、角色行为、交流触发与可见反馈，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头；只交接导演摘要，不公开矩阵、等级、证据、节点或次数。");
    }
  } else if (step === "05") {
    blocks.push(
      data.story_mode === "short"
        ? "上游输入：只接收Step04已锁定的Top6及C01—C06六张Top6导演故事卡，校验3个身份字段 + 12个导演字段（共15字段）齐全，按story_id读取对应的Step02九列故事接口、Step03九列紧凑动画生产接口契约摘要和Step01 natural-language-contract-v1。Step03仍是完整且唯一的视觉事实源。最高优先级：旧版语言机会与复杂分析卡结构全部失效；Step01—04内容只作内部理解故事的隐式语境。Step05从故事核心、主角动力、关键关系、喜剧发动机、儿童期待、反转释放、视觉记忆点和导演边界结合Step02/03恢复场景与角色，从目标词融合方向读取最终2—3个分配词并适配自然英语表达参考；`目标词语言承载环境地图`只作为既有故事事实中目标词可自然发生的隐式环境语境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头，Step05不得恢复、展开、验证或公开复述该地图。Step04内部生产资格与节点证据不是公开卡内容或Step05输入，Step05不恢复、展开或验证Production Spaces，也不重新评级、分词、造节点或改故事。公开输出严格采用Dialogue Reference Sheet式C01—C06，禁止输出语言机会、视觉事件、故事阶段、说话角色与对象分析、角色目标、即时情绪、角色关系、为什么此刻说、反馈闭环、Dialogue Function、Natural Expression Asset、creative_role、language_support、语义作用或儿童记忆价值分析。仅在上游资产真实缺失、task_fingerprint/story_id冲突、语言context未就绪、表达库缺失/损坏/未进入knowledge_source_fingerprint，或Allowed Vocabulary及Step01契约客观无法支持每类最少5条及每个分配词固定3条合规参考时，输出既有STEP05_DIALOGUE_ASSET_BLOCKED；节点是否成立不属于Step05阻塞职责。系统已注入本轮实际有效Allowed Vocabulary。本步必须实际读取同一会话已上传的natural_kids_animation_expression_library.xlsx前9个工作表（00—08）：00_readme、01_taxonomy、expression_patterns、interaction_chains、animation_dialogue_style、comedy_reversal_expression、semantic_class_guidance、target_word_integration_guide、risks_and_checks；禁止读取或复制第10个human_micro_examples正文。内部按当前场景、角色关系、语气、年龄、节奏和反转阶段匹配表达资源；expression_patterns.example_expressions只作参考，须结合当前故事和Allowed Vocabulary重写，不得原样批量复制、按目标词字符串反查或输出内部ID，资源库也不授权新词、词义或词形。一次输出task_fingerprint及英语素材C01—C06；每份依次包含制作序号、story_id、标题、场景表达方向、角色语气参考、Natural Kids Animation Expression Examples、目标词自然融合参考、语言风险和白名单复核。每篇选择2—3个最相关场景分类，默认3类但不得为凑数强造；每类5—10条、默认6条。逐一覆盖Step04分配的2—3个目标词，每词写适合语境并固定给3条自然融合参考。所有Examples必须自然、儿童动画可用、符合Step01和Allowed Vocabulary，可供Step06采用、组合、改写或不用；它们不是最终对白、固定模板、Production Node证明、次数素材或actual_entries来源。不得输出镜头、完整剧本、中文故事或目标词次数规划，也不得修改角色、视觉事实、反转、Top6顺序或Step04分词。"
        : "上游输入：审核本对话Step04故事本体和Step04.5完整语言适配结果；故事评分以Step04为准。不得从Step03或Step04原始故事直接判断白名单可行性，只判断Step04.5方案是否完整并足够支持Step06自然生成。",
      "补充限制：" + data.extraLimits
    );
  } else if (step === "06") {
    blocks.push(
      data.story_mode === "short"
        ? shortKnowledgeReferenceText(data, "06") + "\n\n上游输入：只接收最终Top6对应资产，未入选6行不输入。Step01—Step05均服务于Step06：Step04导演故事卡锁定故事核心、目标词分配和导演边界；其中`目标词语言承载环境地图`只帮助恢复既有故事事实中的目标词自然交流环境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头；Step03紧凑九列仍是完整且唯一的视觉事实源，冲突时以Step03为准；Step05表达银行提供可自由取舍的语言燃料，不能计入actual_entries或覆盖上游事实。Step06是总导演与最终创作者，可综合上游资产创作镜头、表演、微动作、互动、节奏与最终对白，并独立执行Production Space Execution Check。正式创作前执行紧凑Production Space Execution Check，不填写Node1/Node2模板或公开空间证明：优先依据地图恢复每个分配词的既有真实交流环境；地图不构成资格证明。只有地图未覆盖足够的既有真实交流环境、经检查仍确认某词不足两个空间，且不改变Step02故事核心与Step03视觉事实/状态链时，才可在核心事实边界内使用已有角色、已建立场景/资产和允许世界规则补充非核心微情境、互动节拍或镜头。补充空间必须有新的真实目的、对象、回应和可见反馈，并让目标词以同一真实义项形成“说出→回应→变化”。同一动作链、状态、画面标签、复述或同一目的不能拆成双空间。不得改变核心故事、反转、角色、关键资产、世界规则或Step03状态链；但目标词容量、次数或初始空间不足不得路由Step04或BLOCKED，必须由Step06内部补充、重导演、复扫。BLOCKED只用于必需上游事实缺失或不可调和合同冲突。每篇只用Step04分配的2—3个不同目标词，每词至少2次有效角色英文发言；先导演自然儿童动画互动，再执行生产许可证。normal和成功repair的每篇实际剧本都必须附带轻量成稿检查，逐行列出完整2—3词的真实正文次数与有效发言次数。"
        : "上游输入：严格按‘Step05故事卡 -> 相同story_id的Step04.5语言适配卡 -> 英文剧本生成’执行；不得直接从中文故事自由翻译英文，不得重新选故事、角色或反转机制，不得恢复适配卡删除或禁止恢复的概念。英文标题也必须来自适配后的故事概念。最终静默检查失败只退回Step05并标记‘语言适配不足’，不得自行修复故事。",
      data.story_mode === "short"
        ? "导演创作及修复边界：C卡`目标词语言承载环境地图`只帮助恢复既有事实中的自然交流环境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头；Step06优先依据地图恢复既有交流环境，但地图不构成资格证明，Production Space Execution Check仍独立执行并决定最终镜头、对白、节奏与自然重复。Step05表达银行中的场景方向、角色语气、分类例句、目标词融合例句与风险均可自由取舍和二次创作，不是最终对白、固定模板、Production Space证明、次数素材或必用清单。Step06不是素材拼装师；它先导演自然儿童动画互动，再按视觉一致性、对白自然性、生产许可证三类检查。每篇2—3词、每词至少2次有效发言是硬许可证。只有地图未覆盖足够的既有真实交流环境、经检查仍不足两个空间，且不改变Step02故事核心与Step03视觉事实/状态链时，才可在核心事实边界内补充非核心微情境、互动节拍或镜头，使用已有角色、场景、资产与允许规则，并使补充具有真实目的、对象、回应和可见反馈；不得改变核心剧情、反转、角色、关键资产、世界规则或Step03状态链。词汇容量、次数或初始空间不足绝不回Step04或BLOCKED。Repair同样可在上述条件内补充合规非核心节拍，直至许可证通过；BLOCKED只用于必需上游事实缺失或不可调和合同冲突。最终检测只读中文角色名后的英文对白；normal和成功repair的每篇实际剧本必须附带轻量检查，逐词列出本篇完整分配的真实正文与有效发言次数。"
        : "自然台词：优先使用Step04.5定义的核心动作、核心对象、核心关系和表达方向；在适配方案内，用Step01用法边界而非固定例句，自由结合角色、画面和交流意图造句；每个目标词至少3次独立自然发言，可用当前目标词的合法规则词形。禁止为保留原形滥用can/be/have、裸词喊话、机械复读或成稿后补词。表达复杂度随Allowed_Word_Set规模自适应；已有约400词以上时默认写简短完整句，孤立词只在真实呼救、警告、回答或惊讶中使用，不能成为主要复现方式。检查全程静默，成品只显示结果；扩展义仅在“自然融入”一行用中文标注词义和词性。",
      "成品镜头格式：连续使用【镜头一】【镜头二】……；“画面：”后的全部人物动作必须在同一行用中文逗号连接，不得拆段或留空行；随后按“中文角色名：英文台词（中文翻译）”逐句输出，镜头块之间也不得留空行。",
      "时长策略：" + storyModeDisplayLabel(data.story_mode),
      "补充限制：" + data.extraLimits
    );
    if (data.story_mode === "short") {
      blocks.push("Step06生产空间执行、许可证与轻量检查边界：C卡目标词语言承载环境地图只帮助恢复既有事实中的自然交流环境，不是Production Node、资格或生产证据、次数计划、固定对白或固定镜头；Production Space Execution Check仍由Step06独立执行。优先依据地图恢复既有空间；地图不构成资格证明。只有地图未覆盖足够的既有真实交流环境、经检查仍确认分配词不足两个真实交流空间，且不改变Step02故事核心与Step03视觉事实/状态链时，Step06才可在核心事实边界内补充非核心微情境、互动节拍或镜头，使用已有角色、场景、资产和允许世界规则。每个补充空间都要有新的真实目的、对象、回应和可见反馈；同一动作链、状态、画面标签、复述或同一目的不能拆成双空间。不得改变核心故事、反转、角色、关键资产、世界规则或Step03状态链。词汇容量、次数或初始空间不足不得BLOCKED或路由Step04，必须内部补充、重导演、复扫直至每词至少2次有效发言；BLOCKED只用于必需上游事实缺失或不可调和合同冲突。正常模式固定3+3：先锁定并输出01—03，用户输入“继续”后只输出已锁定的04—06。每篇normal或成功repair剧本的轻量成稿检查都必须逐行显示Step04完整2—3词分配的真实正文出现与有效发言次数，不能省略0次或不足项绕过门槛。");
      blocks.push("Production Space Execution Check细则：该检查独立于C卡目标词语言承载环境地图；地图不充当Production Node、资格/生产证据、次数计划、固定对白或固定镜头。两个有效空间须处于不同故事阶段，具有不同交流目的、不同语言需求和不同可见反馈，并以同一真实义项各自形成“说出→回应→变化”。该检查不填写节点明细、不固定台词顺序或句式；先创作，再按视觉一致性、对白自然性与生产许可证验收。只有上游必需事实缺失或不可调和冲突才使用既有BLOCKED，绝不因目标词生产短缺阻塞。");
    }
  } else {
    blocks.push("沿用本对话上一阶段完整输出，不重新建立任务上下文。");
  }
  return blocks.join("\n\n");
}
function getPromptModeBundle(storyMode) {
  if (typeof PROMPT_MODE_LIBRARY === "undefined" || !PROMPT_MODE_LIBRARY.modes) {
    throw new Error("Prompt模式数据未加载。请运行 python scripts/export_prompt_modes.py 后刷新页面。");
  }
  var modeKey = storyMode === "long" ? "long" : "short";
  var bundle = PROMPT_MODE_LIBRARY.modes[modeKey];
  if (!bundle || !bundle.prompts || !bundle.prompts.length) {
    throw new Error("当前创作模式没有可用Prompt：" + modeKey);
  }
  return bundle;
}

function buildStep5AllowedVocabularyText(data) {
  if (
    typeof VocabularyGuard === "undefined" ||
    typeof VOCABULARY_WHITELIST_DATA === "undefined" ||
    !data || !data.vocabularyContext
  ) {
    throw new Error("Step05无法生成Allowed Vocabulary：词汇上下文或本地词表未加载。");
  }
  var allowedContext = VocabularyGuard.buildAllowedVocabularyContext(
    data.vocabularyContext,
    VOCABULARY_WHITELIST_DATA
  );
  if (!allowedContext.valid) {
    throw new Error(
      "Step05无法生成Allowed Vocabulary：" + allowedContext.errors.join("；")
    );
  }
  return allowedContext.allowed_vocabulary_text;
}

function resolveDynamicStepPromptContent(promptContent, promptId, data) {
  if (
    data.story_mode !== "short" ||
    String(promptId || "") !== "short_05_english_dialogue_asset_generator"
  ) {
    return promptContent;
  }
  var marker = "{{allowed_vocabulary}}";
  if (promptContent.indexOf(marker) === -1) {
    throw new Error("Step05源Prompt缺少Allowed Vocabulary注入占位符。");
  }
  return promptContent.split(marker).join(buildStep5AllowedVocabularyText(data));
}
function injectTaskInput(promptContent, sourcePath, data, modeLabel, isCommon, promptId) {
  promptContent = resolveDynamicStepPromptContent(promptContent, promptId, data);
  var actualInput = isCommon
    ? commonTaskInputText(data)
    : stepTaskInputText(promptId, data);
  var taskInput = "## 本次任务实际输入（优先使用）\n\n" +
    "当前模式：" + modeLabel + "\n" +
    "Prompt来源：" + sourcePath + "\n\n" +
    actualInput + "\n\n" +
    "说明：以上实际输入优先于下方Prompt中的空白输入模板；不要自行切换创作模式。" +
    (data.story_mode === "short"
      ? "\n短篇运行注入只补充本步实际输入与轻量输出要求；Step01—Step05的完整资产在编排器内部交接，不向用户公开；只有Step06通过全部门禁后按固定3+3交付完整剧本，不得用READY或摘要冒充最终成稿。"
      : "");
  var semanticStepMatch = String(promptId || "").match(/_(0[1-6])_/);
  var semanticTail = data.story_mode === "short"
    ? "\n\n## 末尾语义硬门（优先级最高）\n" +
      "以下规则在源Prompt的历史/宽泛措辞之后再次复核，冲突时以本块为准：\n" +
      shortGroundedSemanticGateText(semanticStepMatch ? semanticStepMatch[1] : "")
    : "";
  var firstLineEnd = promptContent.indexOf("\n");
  if (firstLineEnd === -1) {
    return promptContent + "\n\n" + taskInput + semanticTail;
  }
  return promptContent.substring(0, firstLineEnd) + "\n\n" +
    taskInput + "\n\n---\n\n" + promptContent.substring(firstLineEnd + 1) + semanticTail;
}

function makePrompts(data) {
  var bundle = getPromptModeBundle(data.story_mode);
  var prompts = [];
  for (var i = 0; i < bundle.prompts.length; i++) {
    var sourcePrompt = bundle.prompts[i];
    var isCommon = sourcePrompt.is_common === true;
    prompts.push({
      promptId: sourcePrompt.prompt_id,
      title: sourcePrompt.title,
      modeLabel: bundle.display_label,
      storyMode: bundle.story_mode,
      sourcePath: sourcePrompt.source_path,
      isCommon: isCommon,
      text: injectTaskInput(
        sourcePrompt.content,
        sourcePrompt.source_path,
        data,
        bundle.display_label,
        isCommon,
        sourcePrompt.prompt_id
      )
    });
  }
  return prompts;
}

function renderPromptCards(prompts) {
  var output = document.getElementById("output");
  output.innerHTML = "";

  for (var i = 0; i < prompts.length; i++) {
    var step = document.createElement("section");
    step.className = "step";

    var title = document.createElement("div");
    title.className = "step-title";

    var heading = document.createElement("div");
    heading.className = "step-heading";
    var h = document.createElement("h3");
    h.appendChild(document.createTextNode(prompts[i].title));
    var modeBadge = document.createElement("span");
    modeBadge.className = "step-mode";
    modeBadge.appendChild(document.createTextNode("当前模式：" + prompts[i].modeLabel));
    heading.appendChild(h);
    heading.appendChild(modeBadge);

    var actions = document.createElement("div");
    actions.className = "step-actions";
    var copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "light";
    copyButton.setAttribute("data-target", "prompt" + i);
    copyButton.onclick = function () {
      copyById(this.getAttribute("data-target"));
    };
    copyButton.appendChild(document.createTextNode("复制本步"));
    actions.appendChild(copyButton);

    var isStoryScriptStep =
      prompts[i].promptId === "short_06_story_script_writer" ||
      prompts[i].promptId === "long_06_story_script_writer";
    if (isStoryScriptStep) {
      var storyboardButton = document.createElement("button");
      storyboardButton.type = "button";
      storyboardButton.className = "storyboard-jump";
      storyboardButton.setAttribute("data-mode", prompts[i].storyMode);
      storyboardButton.onclick = function () {
        openStoryboardTool(this.getAttribute("data-mode"));
      };
      storyboardButton.appendChild(document.createTextNode("进入故事板制作工具 →"));
      actions.appendChild(storyboardButton);
    }

    var area = document.createElement("textarea");
    area.className = "prompt-box";
    area.id = "prompt" + i;
    area.value = prompts[i].text;

    title.appendChild(heading);
    title.appendChild(actions);
    step.appendChild(title);
    step.appendChild(area);
    output.appendChild(step);
  }
}

function generatePrompts() {
  var data;
  var prompts;
  try {
    data = collectData();
    if (!validateData(data)) {
      return;
    }
    data.vocabularyContext = buildCurrentVocabularyContext(data);
    prompts = makePrompts(data);
    saveVocabularyContext(data.vocabularyContext);
  } catch (error) {
    showError("Prompt生成失败：" + (
      error && error.message ? error.message : "请刷新页面后重试。"
    ));
    return;
  }
  renderVocabularyContextPreview(data.vocabularyContext);
  renderPromptCards(prompts);
  hideError();
  showToast("已生成公共原则与" + (prompts.length - 1) + "步Prompt");
}

function openStoryboardTool(mode) {
  var safeMode = mode === "long" ? "long" : "short";
  var context = null;
  try {
    context = JSON.parse(
      localStorage.getItem(VOCABULARY_CONTEXT_STORAGE_PREFIX + safeMode) || "null"
    );
  } catch (error) {
    context = null;
  }
  if (
    !context ||
    context.schema_version !== "vocabulary-context-v1" ||
    context.valid !== true ||
    context.mode !== safeMode
  ) {
    showError(safeMode === "short"
      ? "当前模式没有有效的词汇白名单上下文。请重新生成公共原则与完整生产步骤（短篇含Step05自然英语表达银行适配层）后再进入故事板。"
      : "当前模式没有有效的词汇白名单上下文。请重新生成公共原则与完整生产步骤后再进入故事板。");
    return;
  }
  if (
    typeof VOCABULARY_WHITELIST_DATA === "undefined" ||
    context.source_fingerprint !== VOCABULARY_WHITELIST_DATA.source_fingerprint
  ) {
    showError("离线词表版本已经变化。请重新生成本模式Prompt和词汇上下文后再进入故事板。");
    return;
  }
  if (
    typeof VocabularyGuard === "undefined" ||
    context.task_fingerprint !== VocabularyGuard.fingerprintContext(context)
  ) {
    showError("词汇任务指纹无效。请重新生成本模式Prompt和词汇上下文后再进入故事板。");
    return;
  }
  window.open("storyboard.html?mode=" + encodeURIComponent(safeMode), "_blank");
}

function copyById(id) {
  var area = document.getElementById(id);
  if (!area) {
    return;
  }
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  try {
    var ok = document.execCommand("copy");
    showToast(ok ? "已复制" : "已选中文本，请按 Ctrl+C");
  } catch (error) {
    showToast("已选中文本，请按 Ctrl+C");
  }
}

function copyAllPrompts() {
  var areas = document.querySelectorAll(".prompt-box");
  if (!areas.length) {
    generatePrompts();
    areas = document.querySelectorAll(".prompt-box");
  }
  if (!areas.length) {
    return;
  }

  var chunks = [];
  for (var i = 0; i < areas.length; i++) {
    chunks.push(areas[i].value);
  }
  var temp = document.createElement("textarea");
  temp.value = chunks.join("\n\n==============================\n\n");
  temp.style.position = "fixed";
  temp.style.left = "-1000px";
  temp.style.top = "0";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  temp.setSelectionRange(0, temp.value.length);

  try {
    var ok = document.execCommand("copy");
    document.body.removeChild(temp);
    showToast(ok
      ? "已复制整包备份；请按步骤粘贴，勿一次提交GPT"
      : "整包备份复制受限；请按步骤逐一复制");
  } catch (error) {
    document.body.removeChild(temp);
    showToast("整包备份复制受限；请按步骤逐一复制");
  }
}

function clearPrompts() {
  document.getElementById("output").innerHTML = "";
}

function showToast(message) {
  var toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.display = "block";
  window.setTimeout(function () {
    toast.style.display = "none";
  }, 1600);
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", initPage);
}

function shortKnowledgeReferenceText(data, step) {
  var selected = data.selected_reversal_mechanisms || [];
  var compactSelected = [];
  for (var i = 0; i < selected.length; i++) {
    compactSelected.push({
      mechanism_id: selected[i].mechanism_id,
      mechanism_name: selected[i].mechanism_name
    });
  }
  var knowledgeStatus = data.knowledge_context_status ||
    data.knowledgeContextStatus || "KNOWLEDGE_CONTEXT_UNVERIFIED";
  var knowledgeFingerprint = data.knowledge_source_fingerprint ||
    data.knowledgeSourceFingerprint || "UNVERIFIED";
  var contextHeader = "knowledge_context_status: " + knowledgeStatus +
    "（由Step00后台内部继承，不作为用户可见输出；runtime不得自行宣称READY）\n" +
    "knowledge_source_fingerprint: " + knowledgeFingerprint +
    "（由Step00后台内部继承，不作为用户可见输出）\n" +
    "reversal_mechanism_mode: " + data.templateMode + "\n" +
    "selected_reversal_mechanisms: " + JSON.stringify(compactSelected) + "\n" +
    "允许多机制融合：" + (data.allowFusion ? "是" : "否") + "\n" +
    "允许自由反转：" + (data.allowFreeReversal ? "是" : "否") + "\n";
  if (step === "04") {
    return contextHeader +
      (data.templateMode === "all"
        ? "模式边界：all使用完整机制库，残留selected列表不得收窄候选。\n"
        : "模式边界：partial优先用户所选机制，不得为补多样性擅自切换未选机制。\n") +
      "单片评分和组合搜索前读取同一会话已上传的reversal_mechanism_library.xlsx，使用reversal_family、reversal_drive、emotional_release、similarity_risk和batch_usage_hint辅助包级多样性判断；这些是机制先验，不替代实际观看体验，也不形成硬配额。\n" +
      "Step04不读取funny_detail_library.xlsx，不生成或具体化视觉资产；趣味细节只认Step03已固化事实。\n" +
      "Step04不读取或调用natural_kids_animation_expression_library.xlsx；该库不得影响选片、评分、分词或故事事实。\n" +
      "运行注入只传机制模式、mechanism_id和mechanism_name，不嵌入知识库字段正文；不改变故事或资产，不再次上传，不输出Rxxx编号。";
  }

  var libraryInstruction = step === "02"
    ? "本步在生成前读取同一会话已上传的reversal_mechanism_library.xlsx及其2.0分类字段，并读取funny_detail_library.xlsx的core_formula、trigger_condition、child_effect和usage_risk；all参考完整机制库，partial优先所选机制但不强套。两库共同帮助确定反转方向、喜剧发动机、视觉笑点和角色行为反差，生成后再按故事事实复核；不得先写安全故事再反向贴机制或案例。Step02不读取或调用natural_kids_animation_expression_library.xlsx。"
    : step === "06"
      ? "本步读取同一会话已上传的reversal_mechanism_library.xlsx作为反转一致性参考；Step06不重新选择反转类型，也不读取funny_detail_library.xlsx或human_micro_examples正文。趣味细节库已经由Step03完成导演转化；Step06锁定Step03核心视觉事实，可在其故事事件与资产边界内自主创造镜头表达、表演、微动作、角色互动和节奏，不得新增核心视觉资产或反转。英语创作优先消费Step05已经适配的场景方向、角色语气、分类例句、目标词融合参考与风险；如需核对语言风格，只可按需读取natural_kids_animation_expression_library.xlsx的00—08工作表，不能让库覆盖Step05素材或Step01边界。该库不提供任何Allowed Vocabulary、目标词词义或词形授权；禁止原样批量复制库句、拼装模式、输出内部ID或把该库当成对白白名单。"
      : step === "03"
        ? "本步读取同一会话已上传的reversal_mechanism_library.xlsx和funny_detail_library.xlsx，只把适配内容转化为现有导演资产，不公开库编号或匹配过程。Step03不读取或调用natural_kids_animation_expression_library.xlsx。"
        : "本步读取同一会话已上传的reversal_mechanism_library.xlsx和funny_detail_library.xlsx，只把适配内容转化为现有导演资产，不公开库编号或匹配过程。";
  return contextHeader +
    libraryInstruction + "\n" +
    (step === "06" ? "反转机制库只用于核对已有反转方向一致性；不为Step06提供新笑点、动作或表演，不要求再次上传，不输出Rxxx编号。" : "知识库只提供创意与表演资源；不为匹配条目改变故事，不要求再次上传，不输出Rxxx/Fxxx编号。");
}

