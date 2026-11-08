var SAVE_KEY = "taohua-junjiang-save-v2";

function getDayKey() {
  var now = new Date();
  return now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
}

function makeRoster() {
  return [
    { id: "taoyao", name: "桃夭", title: "桃花小将", role: "战士", level: 3, attack: 52, hp: 180, icon: "🌸", inParty: true, cardClass: "selected" },
    { id: "tuantuan", name: "团团", title: "糯米策士", role: "谋士", level: 2, attack: 43, hp: 145, icon: "☯️", inParty: true, cardClass: "" },
    { id: "xiaofeng", name: "小枫", title: "轻羽弓手", role: "射手", level: 2, attack: 47, hp: 150, icon: "🏹", inParty: true, cardClass: "" }
  ];
}

function makeEnemyTeam(mode, stage) {
  if (mode === "peach") {
    return [
      { name: "迷雾花灵", role: "谋士", icon: "🦋", hp: 82, maxHp: 82, attack: 8, selected: true },
      { name: "桃枝守卫", role: "战士", icon: "🌳", hp: 98, maxHp: 98, attack: 10, selected: false },
      { name: "月影灵狐", role: "射手", icon: "🦊", hp: 78, maxHp: 78, attack: 9, selected: false }
    ];
  }
  if (mode === "arena") {
    return [
      { name: "木人甲", role: "战士", icon: "🥷", hp: 72, maxHp: 72, attack: 7, selected: true },
      { name: "木人乙", role: "射手", icon: "🎯", hp: 68, maxHp: 68, attack: 7, selected: false },
      { name: "木人丙", role: "谋士", icon: "🪄", hp: 75, maxHp: 75, attack: 7, selected: false }
    ];
  }
  var bonus = Math.max(0, (stage - 2) * 12);
  return [
    { name: "黄巾盾卫", role: "战士", icon: "🛡️", hp: 96 + bonus, maxHp: 96 + bonus, attack: 10 + Math.floor(bonus / 8), selected: true },
    { name: "黄巾弓手", role: "射手", icon: "🏹", hp: 76 + bonus, maxHp: 76 + bonus, attack: 11 + Math.floor(bonus / 8), selected: false },
    { name: "黄巾军师", role: "谋士", icon: "📜", hp: 84 + bonus, maxHp: 84 + bonus, attack: 9 + Math.floor(bonus / 8), selected: false }
  ];
}

function makeBattleParty(heroes) {
  var party = heroes.filter(function (hero) { return hero.inParty; }).slice(0, 3);
  if (!party.length && heroes.length) party = [heroes[0]];
  return party.map(function (hero, index) {
    return {
      id: hero.id,
      name: hero.name,
      role: hero.role,
      icon: hero.icon,
      attack: hero.attack,
      hp: hero.hp,
      maxHp: hero.hp,
      acted: false,
      active: index === 0
    };
  });
}

function roleMultiplier(attacker, defender) {
  var counter = { "战士": "射手", "射手": "谋士", "谋士": "战士" };
  if (counter[attacker] === defender) return 1.5;
  if (counter[defender] === attacker) return 0.75;
  return 1;
}

function livingCount(list) {
  return list.filter(function (unit) { return unit.hp > 0; }).length;
}

Page({
  data: {
    gold: 680,
    jade: 12,
    grain: 36,
    townLevel: 3,
    townExp: 58,
    expNeed: 100,
    collected: false,
    farmCollected: false,
    farmLevel: 1,
    taskClaimed: false,
    stamina: 5,
    trialTickets: 3,
    arenaTickets: 2,
    dailyKey: "",
    staminaAt: 0,
    unlockedStage: 2,
    campaignWins: 0,
    activePage: "city",
    showCity: true,
    showMap: false,
    showHeroes: false,
    showTavern: false,
    showTrials: false,
    showBattle: false,
    showDialog: false,
    dialogTitle: "",
    dialogText: "",
    toastText: "",
    toastVisible: false,
    heroes: makeRoster(),
    selectedHero: makeRoster()[0],
    recruitCost: 180,
    partyLabel: "上阵 3 / 3",
    battleMode: "campaign",
    battleReturnPage: "map",
    battleStage: 2,
    battleTitle: "落霞坡",
    battleParty: [],
    battleEnemies: [],
    targetIndex: 0,
    battleEnergy: 0,
    battleTurn: 1,
    battleBuffType: "",
    battleBuffText: "",
    battleWon: false,
    battleLost: false,
    battleMessage: "主公，选好目标，再指挥伙伴出击吧！",
    battleButtonText: "普通攻击",
    battleRewardText: ""
  },

  onLoad: function () {
    try {
      if (typeof xhs !== "undefined" && xhs.getStorageSync) {
        var saved = xhs.getStorageSync(SAVE_KEY);
        if (saved && typeof saved === "object") {
          var heroes = saved.heroes || makeRoster();
          var selectedId = saved.selectedId || heroes[0].id;
          var selectedHero = heroes[0];
          var today = getDayKey();
          var isNewDay = saved.dailyKey !== today;
          var savedStamina = typeof saved.stamina === "number" ? saved.stamina : 5;
          var staminaAt = saved.staminaAt || Date.now();
          var recovered = Math.floor(Math.max(0, Date.now() - staminaAt) / 600000);
          savedStamina = Math.min(5, savedStamina + recovered);
          if (savedStamina >= 5) staminaAt = Date.now();
          for (var i = 0; i < heroes.length; i += 1) {
            if (heroes[i].id === selectedId) selectedHero = heroes[i];
          }
          this.setData({
            gold: typeof saved.gold === "number" ? saved.gold : 680,
            jade: typeof saved.jade === "number" ? saved.jade : 12,
            grain: typeof saved.grain === "number" ? saved.grain : 36,
            townLevel: saved.townLevel || 3,
            townExp: saved.townExp || 58,
            collected: isNewDay ? false : !!saved.collected,
            farmCollected: isNewDay ? false : !!saved.farmCollected,
            farmLevel: saved.farmLevel || 1,
            taskClaimed: isNewDay ? false : !!saved.taskClaimed,
            unlockedStage: saved.unlockedStage || 2,
            campaignWins: saved.campaignWins || 0,
            stamina: savedStamina,
            staminaAt: staminaAt,
            trialTickets: isNewDay ? 3 : (typeof saved.trialTickets === "number" ? saved.trialTickets : 3),
            arenaTickets: isNewDay ? 2 : (typeof saved.arenaTickets === "number" ? saved.arenaTickets : 2),
            dailyKey: today,
            heroes: heroes,
            selectedHero: selectedHero
          });
        }
      }
    } catch (err) {
      // 开发预览环境未提供本地存储时仍可正常游玩。
    }
    this.updatePartyLabel(this.data.heroes);
  },

  onShow: function () {
    var today = getDayKey();
    var patch = {};
    var changed = false;
    if (this.data.dailyKey && this.data.dailyKey !== today) {
      patch.dailyKey = today;
      patch.collected = false;
      patch.farmCollected = false;
      patch.taskClaimed = false;
      patch.trialTickets = 3;
      patch.arenaTickets = 2;
      changed = true;
    } else if (!this.data.dailyKey) {
      patch.dailyKey = today;
      changed = true;
    }
    if (this.data.stamina < 5 && this.data.staminaAt) {
      var recovered = Math.floor(Math.max(0, Date.now() - this.data.staminaAt) / 600000);
      if (recovered > 0) {
        patch.stamina = Math.min(5, this.data.stamina + recovered);
        patch.staminaAt = patch.stamina >= 5 ? Date.now() : this.data.staminaAt + recovered * 600000;
        changed = true;
      }
    }
    if (changed) {
      this.setData(patch);
      this.saveProgress();
    }
  },

  updatePartyLabel: function (heroes) {
    var count = heroes.filter(function (hero) { return hero.inParty; }).length;
    this.setData({ partyLabel: "上阵 " + count + " / 3" });
  },

  saveProgress: function () {
    try {
      if (typeof xhs !== "undefined" && xhs.setStorageSync) {
        xhs.setStorageSync(SAVE_KEY, {
          gold: this.data.gold,
          jade: this.data.jade,
          grain: this.data.grain,
          townLevel: this.data.townLevel,
          townExp: this.data.townExp,
          collected: this.data.collected,
          farmCollected: this.data.farmCollected,
          farmLevel: this.data.farmLevel,
          taskClaimed: this.data.taskClaimed,
          unlockedStage: this.data.unlockedStage,
          campaignWins: this.data.campaignWins,
          stamina: this.data.stamina,
          staminaAt: this.data.staminaAt || Date.now(),
          trialTickets: this.data.trialTickets,
          arenaTickets: this.data.arenaTickets,
          dailyKey: getDayKey(),
          heroes: this.data.heroes,
          selectedId: this.data.selectedHero.id,
          updatedAt: Date.now()
        });
      }
    } catch (err) {
      // 保存失败不阻断当前游戏体验。
    }
  },

  gainTownExp: function (amount) {
    var progress = this.data.townExp + amount;
    var level = this.data.townLevel;
    var gold = this.data.gold;
    var levelsGained = 0;
    while (progress >= this.data.expNeed) {
      progress -= this.data.expNeed;
      level += 1;
      levelsGained += 1;
      gold += level * 60;
    }
    this.setData({ townExp: progress, townLevel: level, gold: gold });
    if (levelsGained) this.showToast("城池升到 Lv." + level + "，额外获得铜钱！");
  },

  showToast: function (message) {
    var that = this;
    this.setData({ toastText: message, toastVisible: true });
    setTimeout(function () {
      that.setData({ toastVisible: false });
    }, 1800);
  },

  showPage: function (name) {
    this.setData({
      activePage: name,
      showCity: name === "city",
      showMap: name === "map",
      showHeroes: name === "heroes",
      showTavern: name === "tavern",
      showTrials: name === "trials",
      showBattle: name === "battle",
      showDialog: false
    });
  },

  changeTab: function (e) {
    this.showPage(e.currentTarget.dataset.page);
  },

  collectTax: function () {
    if (this.data.collected) return this.showToast("今日城池收益已经收下啦");
    this.setData({
      gold: this.data.gold + 120 + this.data.townLevel * 8,
      collected: true
    });
    this.gainTownExp(12);
    this.saveProgress();
    this.showToast("主城收益到账，繁荣度也提升啦！");
  },

  collectFarm: function () {
    if (this.data.farmCollected) return this.showToast("农庄今天已经收成过啦");
    var grain = 28 + this.data.farmLevel * 12;
    this.setData({
      grain: this.data.grain + grain,
      farmCollected: true
    });
    this.gainTownExp(8);
    this.saveProgress();
    this.showToast("农庄收成：粮草 +" + grain);
  },

  upgradeFarm: function () {
    var cost = 100 + this.data.farmLevel * 80;
    if (this.data.farmLevel >= 5) return this.showToast("农庄已经升到最高等级");
    if (this.data.gold < cost) return this.showToast("铜钱不够，先去征战或收税吧");
    this.setData({
      gold: this.data.gold - cost,
      farmLevel: this.data.farmLevel + 1
    });
    this.saveProgress();
    this.showToast("农庄升级到 Lv." + (this.data.farmLevel) + "，明天收成更多！");
  },

  claimTask: function () {
    if (this.data.taskClaimed) return this.showToast("任务奖励已经领取");
    this.setData({
      gold: this.data.gold + 80,
      jade: this.data.jade + 2,
      taskClaimed: true
    });
    this.saveProgress();
    this.showToast("小事办妥：铜钱 ×80、玉璧 ×2");
  },

  openBuilding: function (e) {
    var action = e.currentTarget.dataset.action;
    var page = e.currentTarget.dataset.page;
    if (page) return this.showPage(page);
    if (action === "farm") return this.collectFarm();
    if (action === "upgrade") return this.upgradeFarm();
    this.setData({
      showDialog: true,
      dialogTitle: "小小提示",
      dialogText: "这座建筑正在修缮，城池等级提升后会开放更多玩法。"
    });
  },

  closeDialog: function () {
    this.setData({ showDialog: false });
  },

  openSettings: function () {
    this.setData({
      showDialog: true,
      dialogTitle: "主公小屋",
      dialogText: "桃花城 · 高清画面\n城池进度保存在本机。\n城池 Lv." + this.data.townLevel + " · 农庄 Lv." + this.data.farmLevel
    });
  },

  openMainQuest: function () {
    this.setData({
      showDialog: true,
      dialogTitle: "新手主线 · 桃花村的来信",
      dialogText: "招募伙伴、建设城池，再带三人小队出征。完成一场战役，就能开启下一段山河故事。"
    });
  },

  openNotice: function () {
    this.setData({
      showDialog: true,
      dialogTitle: "行囊与战利品",
      dialogText: "铜钱 " + this.data.gold + " · 粮草 " + this.data.grain + " · 玉璧 " + this.data.jade + "\n粮草可用于伙伴训练，玉璧暂作为活动收藏品。"
    });
  },

  selectHero: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var heroes = this.data.heroes.slice();
    for (var i = 0; i < heroes.length; i += 1) heroes[i].cardClass = i === index ? "selected" : "";
    this.setData({ heroes: heroes, selectedHero: heroes[index] });
    this.saveProgress();
  },

  toggleParty: function (e) {
    var id = e.currentTarget.dataset.id;
    var heroes = this.data.heroes.slice();
    var selected = null;
    for (var i = 0; i < heroes.length; i += 1) {
      if (heroes[i].id === id) selected = heroes[i];
    }
    if (!selected) return;
    if (selected.inParty) {
      if (heroes.filter(function (hero) { return hero.inParty; }).length <= 1) {
        return this.showToast("队伍里至少要留一位伙伴");
      }
      selected.inParty = false;
    } else {
      if (heroes.filter(function (hero) { return hero.inParty; }).length >= 3) {
        return this.showToast("最多上阵三位伙伴，先换下一位吧");
      }
      selected.inParty = true;
    }
    this.setData({ heroes: heroes });
    this.updatePartyLabel(heroes);
    this.saveProgress();
  },

  trainHero: function () {
    if (this.data.gold < 100) return this.showToast("铜钱不够啦，先去城池收获一些吧");
    if (this.data.grain < 8) return this.showToast("粮草不足，去农庄收成一些吧");
    var heroes = this.data.heroes.slice();
    var selectedIndex = 0;
    for (var i = 0; i < heroes.length; i += 1) {
      if (heroes[i].id === this.data.selectedHero.id) selectedIndex = i;
    }
    heroes[selectedIndex].level += 1;
    heroes[selectedIndex].attack += 8;
    heroes[selectedIndex].hp += 20;
    this.setData({
      gold: this.data.gold - 100,
      grain: this.data.grain - 8,
      heroes: heroes,
      selectedHero: heroes[selectedIndex]
    });
    this.saveProgress();
    this.showToast(this.data.selectedHero.name + " 成长啦！攻击 +8，体力 +20");
  },

  recruitHero: function () {
    if (this.data.gold < this.data.recruitCost) return this.showToast("铜钱不够啦，先去城池收获一些吧");
    var next;
    if (this.data.heroes.length % 2 === 1) {
      next = { id: "shuangling-" + Date.now(), name: "霜铃", title: "月兔医官", role: "谋士", level: 1, attack: 38, hp: 132, icon: "🐇", inParty: false, cardClass: "selected" };
    } else {
      next = { id: "chixia-" + Date.now(), name: "赤霞", title: "小小火弓", role: "射手", level: 1, attack: 45, hp: 126, icon: "🔥", inParty: false, cardClass: "selected" };
    }
    var heroes = this.data.heroes.slice();
    for (var i = 0; i < heroes.length; i += 1) heroes[i].cardClass = "";
    heroes.push(next);
    this.setData({
      gold: this.data.gold - this.data.recruitCost,
      heroes: heroes,
      selectedHero: next
    });
    this.saveProgress();
    this.showToast("新伙伴 " + next.name + " 加入啦！去武将页安排阵容");
  },

  startBattle: function (e) {
    var stage = Number(e.currentTarget.dataset.stage || 2);
    this.startEncounter("campaign", stage, "map");
  },

  startTrial: function () {
    if (this.data.trialTickets <= 0) return this.showToast("今日秘境次数已用完，明日再来");
    var blessings = [
      { type: "guard", text: "桃花护佑：每次受击少承受 3 点伤害" },
      { type: "energy", text: "灵泉回响：普攻额外积攒合击能量" },
      { type: "weaken", text: "古树相助：守护灵初始体力降低" }
    ];
    var blessingIndex = (Date.now() + this.data.trialTickets) % blessings.length;
    var blessing = blessings[blessingIndex];
    this.setData({ trialTickets: this.data.trialTickets - 1 });
    this.saveProgress();
    this.startEncounter("peach", 1, "trials", blessing);
  },

  startArena: function () {
    if (this.data.arenaTickets <= 0) return this.showToast("今日演武次数已用完，明日再来");
    this.setData({ arenaTickets: this.data.arenaTickets - 1 });
    this.saveProgress();
    this.startEncounter("arena", 1, "trials");
  },

  startEncounter: function (mode, stage, returnPage, blessing) {
    var party = makeBattleParty(this.data.heroes);
    if (mode === "campaign" && this.data.stamina <= 0) return this.showToast("体力不足，稍后会慢慢恢复");
    if (mode === "campaign") {
      this.setData({
        stamina: this.data.stamina - 1,
        staminaAt: this.data.staminaAt || Date.now()
      });
      this.saveProgress();
    }
    var title = mode === "peach" ? "桃源迷阵" : mode === "arena" ? "演武校场" : stage === 2 ? "落霞坡" : "汜水小路";
    var enemies = makeEnemyTeam(mode, stage);
    if (mode === "peach" && blessing && blessing.type === "weaken") {
      for (var i = 0; i < enemies.length; i += 1) {
        enemies[i].hp = Math.max(40, enemies[i].hp - 12);
        enemies[i].maxHp = enemies[i].hp;
      }
    }
    var hasBond = party.length === 3 &&
      party.some(function (unit) { return unit.id === "taoyao"; }) &&
      party.some(function (unit) { return unit.id === "tuantuan"; }) &&
      party.some(function (unit) { return unit.id === "xiaofeng"; });
    var startingEnergy = (hasBond ? 35 : 0) + (mode === "peach" && blessing && blessing.type === "energy" ? 20 : 0);
    var messages = {
      campaign: "三人小队列阵完毕。克制对手职业，能打出更高伤害。",
      peach: "秘境灵气涌动。选中目标，寻找克制它的伙伴！",
      arena: "演武开始！这是友好的木人挑战，试试你的阵容搭配。"
    };
    var intro = messages[mode];
    if (hasBond) intro += " 桃花三杰羁绊：初始能量 +35。";
    if (mode === "peach" && blessing) intro += " " + blessing.text + "。";
    this.setData({
      showCity: false,
      showMap: false,
      showHeroes: false,
      showTavern: false,
      showTrials: false,
      showBattle: true,
      activePage: "battle",
      battleMode: mode,
      battleReturnPage: returnPage,
      battleStage: stage,
      battleTitle: title,
      battleParty: party,
      battleEnemies: enemies,
      targetIndex: 0,
      battleEnergy: startingEnergy,
      battleTurn: 1,
      battleBuffType: mode === "peach" && blessing ? blessing.type : "",
      battleBuffText: mode === "peach" && blessing ? blessing.text : "",
      battleWon: false,
      battleLost: false,
      battleMessage: intro,
      battleButtonText: "普通攻击",
      battleRewardText: ""
    });
  },

  selectTarget: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    if (this.data.battleEnemies[index] && this.data.battleEnemies[index].hp > 0) {
      var enemies = this.data.battleEnemies.slice();
      for (var i = 0; i < enemies.length; i += 1) enemies[i].selected = i === index;
      this.setData({ targetIndex: index, battleEnemies: enemies });
    }
  },

  battleAction: function (e) {
    if (this.data.battleWon || this.data.battleLost) return this.returnFromBattle();
    var useSkill = e.currentTarget.dataset.action === "skill";
    if (useSkill && this.data.battleEnergy < 100) return this.showToast("合击能量还没满，再普通攻击几次吧");

    var party = this.data.battleParty.slice();
    var enemies = this.data.battleEnemies.slice();
    var actorIndex = -1;
    for (var p = 0; p < party.length; p += 1) {
      if (party[p].hp > 0 && !party[p].acted) {
        actorIndex = p;
        break;
      }
    }
    if (actorIndex < 0) actorIndex = 0;
    var actor = party[actorIndex];
    var targetIndex = this.data.targetIndex;
    if (!enemies[targetIndex] || enemies[targetIndex].hp <= 0) {
      targetIndex = enemies.findIndex(function (enemy) { return enemy.hp > 0; });
    }
    if (targetIndex < 0) return this.finishBattle(true, party, enemies);

    var target = enemies[targetIndex];
    var multiplier = roleMultiplier(actor.role, target.role);
    var damage = Math.round(actor.attack * multiplier * (useSkill ? 1.75 : 0.82));
    var roleText = multiplier > 1 ? "职业克制！" : multiplier < 1 ? "职业稍有不利。" : "";
    if (useSkill) {
      for (var j = 0; j < enemies.length; j += 1) {
        if (enemies[j].hp > 0) enemies[j].hp = Math.max(0, enemies[j].hp - Math.round(damage * (j === targetIndex ? 1 : 0.42)));
      }
    } else {
      enemies[targetIndex].hp = Math.max(0, enemies[targetIndex].hp - damage);
    }
    party[actorIndex].acted = true;
    party[actorIndex].active = false;
    var nextActorIndex = -1;
    for (var k = 0; k < party.length; k += 1) {
      if (party[k].hp > 0 && !party[k].acted) {
        nextActorIndex = k;
        party[k].active = true;
        break;
      }
    }
    var energyGain = this.data.battleBuffType === "energy" ? 44 : 34;
    var energy = useSkill ? 0 : Math.min(100, this.data.battleEnergy + energyGain);
    var actionText = useSkill ? actor.name + " 发动桃花合击！" : actor.name + " 攻击 " + target.name + "，造成 " + damage + " 点伤害。";
    if (livingCount(enemies) <= 0) {
      this.setData({ battleParty: party, battleEnemies: enemies, battleEnergy: energy });
      return this.finishBattle(true, party, enemies);
    }

    var message = actionText + " " + roleText;
    if (nextActorIndex < 0) {
      var counterText = [];
      var heroTargetIndex = 0;
      while (heroTargetIndex < party.length && party[heroTargetIndex].hp <= 0) heroTargetIndex += 1;
      for (var eIndex = 0; eIndex < enemies.length; eIndex += 1) {
        if (enemies[eIndex].hp <= 0 || heroTargetIndex >= party.length) continue;
        var counterDamage = Math.max(1, enemies[eIndex].attack - (this.data.battleBuffType === "guard" ? 3 : 0));
        party[heroTargetIndex].hp = Math.max(0, party[heroTargetIndex].hp - counterDamage);
        counterText.push(enemies[eIndex].name + " 反击 -" + counterDamage);
        if (party[heroTargetIndex].hp <= 0) {
          heroTargetIndex += 1;
          while (heroTargetIndex < party.length && party[heroTargetIndex].hp <= 0) heroTargetIndex += 1;
        }
      }
      for (var reset = 0; reset < party.length; reset += 1) {
        party[reset].acted = false;
        party[reset].active = reset === heroTargetIndex;
      }
      if (livingCount(party) <= 0) {
        this.setData({ battleParty: party, battleEnemies: enemies, battleEnergy: energy });
        return this.finishBattle(false, party, enemies, actionText + " " + counterText.join(" · "));
      }
      message += (counterText.length ? " " + counterText.join(" · ") + "。" : "");
      this.setData({ battleTurn: this.data.battleTurn + 1 });
    }
    var nextTarget = enemies.findIndex(function (enemy) { return enemy.hp > 0; });
    for (var mark = 0; mark < enemies.length; mark += 1) enemies[mark].selected = mark === nextTarget;
    this.setData({
      battleParty: party,
      battleEnemies: enemies,
      targetIndex: Math.max(0, nextTarget),
      battleEnergy: energy,
      battleMessage: message
    });
  },

  finishBattle: function (won, party, enemies, message) {
    var reward = this.data.battleMode === "peach" ? 55 : this.data.battleMode === "arena" ? 40 : 100;
    var exp = this.data.battleMode === "campaign" ? 24 : 12;
    var unlockedStage = this.data.unlockedStage;
    var wins = this.data.campaignWins;
    var gold = this.data.gold;
    var jade = this.data.jade;
    var battleMessage;
    var rewardText = "";
    if (won) {
      gold += reward;
      if (this.data.battleMode === "peach") jade += 1;
      if (this.data.battleMode === "campaign") {
        wins += 1;
        if (this.data.battleStage >= unlockedStage) unlockedStage = this.data.battleStage + 1;
      }
      rewardText = "战利品 · 铜钱 +" + reward + (this.data.battleMode === "peach" ? " · 玉璧 +1" : "") + " · 繁荣 +" + exp;
      battleMessage = "队伍配合得真棒！这场胜利属于桃花小队。";
    } else {
      battleMessage = message || "伙伴们需要休整一下，整理阵容后再来挑战吧。";
    }
    this.setData({
      battleParty: party,
      battleEnemies: enemies,
      battleWon: !!won,
      battleLost: !won,
      battleMessage: battleMessage,
      battleButtonText: won ? "收下战利品" : "返回整队",
      battleRewardText: rewardText,
      gold: gold,
      jade: jade,
      unlockedStage: unlockedStage,
      campaignWins: wins
    });
    if (won) this.gainTownExp(exp);
    this.saveProgress();
  },

  returnFromBattle: function () {
    var page = this.data.battleReturnPage || "map";
    this.showPage(page);
  }
});
