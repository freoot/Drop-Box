/*
 * “是好汉就上山” roster and encounter data.
 * Canonical 108 order, names, stars and bynames follow the Liangshan seating
 * chart in Water Margin, chapter 71. Combat numbers and all skill designs are
 * original game adaptations; see GAME_DESIGN.md for source notes and rules.
 */
(() => {
  const seats = [
    ['宋江','天魁星','及时雨'],['卢俊义','天罡星','玉麒麟'],['吴用','天机星','智多星'],['公孙胜','天闲星','入云龙'],
    ['关胜','天勇星','大刀'],['林冲','天雄星','豹子头'],['秦明','天猛星','霹雳火'],['呼延灼','天威星','双鞭'],
    ['花荣','天英星','小李广'],['柴进','天贵星','小旋风'],['李应','天富星','扑天雕'],['朱仝','天满星','美髯公'],
    ['鲁智深','天孤星','花和尚'],['武松','天伤星','行者'],['董平','天立星','双枪将'],['张清','天捷星','没羽箭'],
    ['杨志','天暗星','青面兽'],['徐宁','天祐星','金枪手'],['索超','天空星','急先锋'],['戴宗','天速星','神行太保'],
    ['刘唐','天异星','赤发鬼'],['李逵','天杀星','黑旋风'],['史进','天微星','九纹龙'],['穆弘','天究星','没遮拦'],
    ['雷横','天退星','插翅虎'],['李俊','天寿星','混江龙'],['阮小二','天剑星','立地太岁'],['张横','天竟星','船火儿'],
    ['阮小五','天罪星','短命二郎'],['张顺','天损星','浪里白条'],['阮小七','天败星','活阎罗'],['杨雄','天牢星','病关索'],
    ['石秀','天慧星','拼命三郎'],['解珍','天暴星','两头蛇'],['解宝','天哭星','双尾蝎'],['燕青','天巧星','浪子'],
    ['朱武','地魁星','神机军师'],['黄信','地煞星','镇三山'],['孙立','地勇星','病尉迟'],['宣赞','地杰星','丑郡马'],
    ['郝思文','地雄星','井木犴'],['韩滔','地威星','百胜将'],['彭玘','地英星','天目将'],['单廷珪','地奇星','圣水将'],
    ['魏定国','地猛星','神火将'],['萧让','地文星','圣手书生'],['裴宣','地正星','铁面孔目'],['欧鹏','地阔星','摩云金翅'],
    ['邓飞','地阖星','火眼狻猊'],['燕顺','地强星','锦毛虎'],['杨林','地暗星','锦豹子'],['凌振','地轴星','轰天雷'],
    ['蒋敬','地会星','神算子'],['吕方','地佐星','小温侯'],['郭盛','地祐星','赛仁贵'],['安道全','地灵星','神医'],
    ['皇甫端','地兽星','紫髯伯'],['王英','地微星','矮脚虎'],['扈三娘','地慧星','一丈青'],['鲍旭','地暴星','丧门神'],
    ['樊瑞','地然星','混世魔王'],['孔明','地猖星','毛头星'],['孔亮','地狂星','独火星'],['项充','地飞星','八臂哪吒'],
    ['李衮','地走星','飞天大圣'],['金大坚','地巧星','玉臂匠'],['马麟','地明星','铁笛仙'],['童威','地进星','出洞蛟'],
    ['童猛','地退星','翻江蜃'],['孟康','地满星','玉幡竿'],['侯健','地遂星','通臂猿'],['陈达','地周星','跳涧虎'],
    ['杨春','地隐星','白花蛇'],['郑天寿','地异星','白面郎君'],['陶宗旺','地理星','九尾龟'],['宋清','地俊星','铁扇子'],
    ['乐和','地乐星','铁叫子'],['龚旺','地捷星','花项虎'],['丁得孙','地速星','中箭虎'],['穆春','地镇星','小遮拦'],
    ['曹正','地嵇星','操刀鬼'],['宋万','地魔星','云里金刚'],['杜迁','地妖星','摸着天'],['薛永','地幽星','病大虫'],
    ['施恩','地伏星','金眼彪'],['李忠','地僻星','打虎将'],['周通','地空星','小霸王'],['汤隆','地孤星','金钱豹子'],
    ['杜兴','地全星','鬼脸儿'],['邹渊','地短星','出林龙'],['邹润','地角星','独角龙'],['朱贵','地囚星','旱地忽律'],
    ['朱富','地藏星','笑面虎'],['蔡福','地平星','铁臂膊'],['蔡庆','地损星','一枝花'],['李立','地奴星','催命判官'],
    ['李云','地察星','青眼虎'],['焦挺','地恶星','没面目'],['石勇','地丑星','石将军'],['孙新','地数星','小尉迟'],
    ['顾大嫂','地阴星','母大虫'],['张青','地刑星','菜园子'],['孙二娘','地壮星','母夜叉'],['王定六','地劣星','活闪婆'],
    ['郁保四','地健星','险道神'],['白胜','地耗星','白日鼠'],['时迁','地贼星','鼓上蚤'],['段景住','地狗星','金毛犬']
  ];

  const archerSeats = new Set([9,16,18,34,39,42,43,48,52,55,64,65,67,72,73,78,79,87,99,104]);
  const strategistSeats = new Set([1,3,4,20,37,44,45,46,47,52,53,56,57,61,66,70,71,76,77,81,88,89,92,93,96,97,106,107,108]);
  const darkSeats = new Set([1,2,3,4,5,6,9,13,14,22,26,30,36,59]);
  const redSeats = new Set([7,8,10,11,12,15,16,17,18,19,20,21,23,24,25,27,28,29,31,32,33,34,35]);
  const startingSeats = new Set([1,3,6,9,22]);
  const femaleSeats = new Set([59,101,103]);
  const storySeats = new Map([[13,'第一章首胜'],[14,'第二章首胜'],[36,'第三章首胜'],[59,'第四章首胜'],[30,'第五章首胜'],[37,'第六章首胜']]);
  const names = {
    '宋江':'郓城押司，常以周济与调停结交江湖人物。', '卢俊义':'河北富户，枪棒精熟，后来成为梁山首领之一。',
    '吴用':'梁山军师，善于谋划与设局。', '公孙胜':'蓟州道人，小说中兼具术法色彩的军师。',
    '关胜':'熟读兵书的武将，以大刀和统率见长。', '林冲':'禁军教头，枪法沉稳，因受陷害而被逼上梁山。',
    '秦明':'性烈勇猛的马军头领，常任先锋。', '呼延灼':'出身将门，以双鞭和连环马战法闻名。',
    '花荣':'弓马娴熟，百步穿杨，素与宋江交厚。', '柴进':'后周皇族后裔，乐于接济落难江湖人。',
    '鲁智深':'曾任提辖，豪爽仗义，力大而重情。', '武松':'景阳冈打虎闻名，近身格斗强悍。',
    '李逵':'性情直率鲁莽，使用双斧冲阵。', '张清':'善以飞石制敌，擅长扰乱对方阵脚。',
    '戴宗':'负责传递军情，小说以神行之术表现其机动性。', '燕青':'卢俊义亲随，机敏灵巧，文武皆通。',
    '扈三娘':'女将，擅使双刀，骑术敏捷。', '安道全':'梁山医者，负责疗伤与救治。',
    '凌振':'精于火炮制造，提供远程火力。', '时迁':'身手轻捷，长于潜入、侦察与取物。',
    '张顺':'水军头领，擅长潜游与水下突袭，常与兄长张横协同。',
    '朱武':'少华山旧部，熟悉阵法与调度，在梁山担任军务参谋。'
  };
  const roleBases = {
    '战士': {hp:196, atk:38, move:3, range:1},
    '射手': {hp:154, atk:37, move:2, range:3},
    '谋士': {hp:166, atk:35, move:2, range:3}
  };
  const qualityScale = {blue:1, purple:1.07, red:1.15, diamond:1.25};
  const roleKits = {
    '战士': {
      passive:[
        {name:'先登之勇',code:'vanguard',trigger:'战斗开始时',description:'生命上限提高 8%；相邻友军少于 2 人时，攻击提高 8%。',hpRatio:.08,atkRatio:.08},
        {name:'百炼筋骨',code:'unyielding',trigger:'首次生命低于 50% 时',description:'本场首次低于半血时获得相当于生命上限 14% 的护盾。',shieldRatio:.14},
        {name:'乘势追击',code:'finisher',trigger:'攻击生命低于 50% 的敌人时',description:'对半血以下目标造成额外 12% 伤害。',damageRatio:.12},
        {name:'稳守中军',code:'guard',trigger:'战斗开始及每回合开始时',description:'获得 8% 生命上限的护盾，持续至受击。',shieldRatio:.08}
      ],
      actives:[
        ['破阵', 'damage',1.55,1,0,'单体'],['横扫', 'cleave',1.05,1,1,'目标周围一格'],['震喝', 'stun',1.18,1,0,'单体眩晕'],['回马击', 'damage',1.38,2,0,'两格内单体重击'],['压阵', 'weaken',1.24,1,0,'单体虚弱']
      ],
      verbs:['铁骑踏阵','刀光回旋','重槊裂地','双鞭落雷','护阵反击']
    },
    '射手': {
      passive:[
        {name:'百步穿杨',code:'marksman',trigger:'普攻距离达到 3 格时',description:'远距离普攻伤害提高 12%。',damageRatio:.12},
        {name:'先发弦音',code:'quickdraw',trigger:'第一回合',description:'第一回合攻击提高 15%，之后恢复常态。',atkRatio:.15},
        {name:'穿甲箭簇',code:'piercer',trigger:'普攻命中时',description:'普攻忽略目标 10% 防护；本原型以额外 8% 伤害表示。',damageRatio:.08},
        {name:'游走射位',code:'skirmish',trigger:'移动后普攻时',description:'移动后本回合首次普攻提高 10% 伤害。',damageRatio:.10}
      ],
      actives:[
        ['穿云箭','damage',1.62,4,0,'单体'],['连珠箭','pierce',1.12,3,1,'同一横排贯穿'],['压制矢','weaken',1.28,4,0,'单体虚弱'],['火箭齐发','burn',1.20,3,1,'目标周围一格灼烧'],['定身箭','stun',1.08,4,0,'单体眩晕']
      ],
      verbs:['穿云破甲','连珠追影','飞矢封路','火羽散射','定身落星']
    },
    '谋士': {
      passive:[
        {name:'运筹帷幄',code:'tactician',trigger:'战斗开始时',description:'全队首次名将技伤害提高 8%。',damageRatio:.08},
        {name:'济急施援',code:'healer',trigger:'回合开始时',description:'为生命比例最低的友军回复其生命上限 4%。',healRatio:.04},
        {name:'阵图护佑',code:'ward',trigger:'战斗开始时',description:'生命最低的友军获得 12% 生命上限护盾。',shieldRatio:.12},
        {name:'奇谋制敌',code:'disruptor',trigger:'名将技命中时',description:'名将技命中后使目标攻击降低 8%，持续 1 回合。',atkDown:.08}
      ],
      actives:[
        ['奇门策','weaken',1.36,4,0,'单体虚弱'],['火符阵','burn',1.22,3,1,'目标周围一格灼烧'],['援军策','heal',0,3,0,'友军单体治疗'],['壁垒令','guard',0,3,0,'友军单体护盾'],['落石阵','cleave',1.16,3,1,'目标周围一格']
      ],
      verbs:['移星换斗','暗渡陈仓','聚石成阵','借风行火','固守粮道']
    }
  };
  const palettes = ['#bd6549','#466b6e','#607b56','#b58a45','#786397','#b66c84','#3e6a92','#a45d48','#67938a','#8b6a50','#5b668c','#bb805a'];
  const icons = {'战士':['🗡️','🪓','🛡️','🥋','🐯','🐉'],'射手':['🏹','🎯','🪨','🔥','🪶','🪃'],'谋士':['📜','🧭','☯️','🌿','🧪','🌩️']};
  const heroData = seats.map(([name,star,epithet],i) => {
    const rank=i+1, role=archerSeats.has(rank)?'射手':strategistSeats.has(rank)?'谋士':'战士';
    const quality=darkSeats.has(rank)?'diamond':redSeats.has(rank)?'red':rank<=72?'purple':'blue';
    const base=roleBases[role], scale=qualityScale[quality]*(.91+(109-rank)*.0018);
    const kit=roleKits[role], passive={...kit.passive[(rank-1)%kit.passive.length]};
    const pick=(offset) => {
      const spec=kit.actives[(rank+offset)%kit.actives.length];
      const [label,type,multiplier,range,radius,area]=spec;
      const namePart=epithet.length>2?epithet.slice(0,2):epithet;
      const skillName=`${namePart}·${label}`;
      const target=type==='heal'||type==='guard'?'ally_single':'enemy_single';
      const status=type==='stun'?'眩晕':type==='burn'?'灼烧':type==='weaken'?'虚弱':'';
      const duration=status==='眩晕'?1:status?2:0;
      const effect={type,multiplier,area,radius,status,duration,shieldRatio:type==='guard'?.22:0,healRatio:type==='heal'?.24:0};
      const condition=type==='heal'?'选择射程内一名友军，回复生命上限 24%':type==='guard'?'选择射程内一名友军，获得生命上限 22% 的护盾':`选择射程内${area}敌人，造成${Math.round(multiplier*100)}%攻击伤害${status?`并施加${status} ${duration} 回合`:''}`;
      return {id:`skill-${rank}-${offset}`,name:skillName,trigger:'主动；每场战斗限用一次',target,range,area,effect,condition,description:`${condition}。`};
    };
    const first=pick(0),second=pick(2);
    const acquisition=startingSeats.has(rank)?{method:'story_start',source:'初始编队'}:storySeats.has(rank)?{method:'story_reward',source:storySeats.get(rank)}:{method:'recruit_or_exchange',source:'酒馆寻访，或黑市 30 枚信物定向合成'};
    const materials={levelCoin:100+Math.floor(rank/12)*20,levelCoinStep:40,skillCultivation:15+(rank%4)*5,skillCultivationStep:5,shardsToRecruit:30,gearFragments:2};
    const bio=names[name]||`梁山第${rank}位头领，绰号「${epithet}」，擅长${role==='战士'?'冲阵与近身压制':role==='射手'?'远程牵制与精准打击':'阵法支援与战局调度'}。`;
    const hero={id:`hero-${String(rank).padStart(3,'0')}`,rank,name,star,epithet,bio,gender:femaleSeats.has(rank)?'女':'男',faction:'梁山泊',origin:rank<=36?'天罡三十六星':rank<=72?'地煞前段':'地煞后段',quality,role,
      hp:Math.round(base.hp*scale),atk:Math.round(base.atk*scale),move:role==='战士'?(rank%9===0?4:rank%7===0?2:3):2,range:role==='战士'?1:3,
      icon:icons[role][(rank-1)%icons[role].length],color:palettes[(rank-1)%palettes.length],passive,skills:[first,second],
      exclusiveTrait:quality==='diamond'||quality==='red'?{name:`${epithet}·名将特性`,description:quality==='diamond'?`名将技伤害提高 8%，并获得专属称号「${epithet}」。`:`名将技伤害提高 6%。`,damageRatio:quality==='diamond'?.08:.06}:null,
      designStatus:names[name]?'人物简介已校对；技能效果使用职业组，待逐将深化':'已可完整游玩；人物简介与专属技能待逐将校对',
      bonds:[],acquisition,materials,ownedAtStart:startingSeats.has(rank)};
    return hero;
  });

  // Reusable cell-shape templates (see docs/HERO_SKILL_SHAPES.md). Bigger footprint => lower per-cell
  // multiplier; splash is the factor applied to every hit cell other than the clicked target.
  const skillShapes={
    single:{label:'单体',cells:1,multiplier:1.62,splash:1},
    line2:{label:'直刺两格（目标及其身后一格）',cells:2,multiplier:1.40,splash:.80},
    xcross:{label:'斜十字五格',cells:5,multiplier:1.16,splash:.72},
    cross5:{label:'十字五格',cells:5,multiplier:1.16,splash:.72},
    fan:{label:'前方扇形四格（目标及其身后三格）',cells:4,multiplier:1.22,splash:.75},
    column:{label:'目标所在纵列四格',cells:4,multiplier:1.18,splash:.75},
    line:{label:'同横排贯穿（自身至目标）',cells:7,multiplier:1.12,splash:.72},
    six:{label:'两排三列六格',cells:6,multiplier:1.14,splash:.70},
    ring8:{label:'目标周围八格（不含中心）',cells:8,multiplier:1.10,splash:.70},
    square9:{label:'目标周围九格（含中心）',cells:9,multiplier:1.00,splash:.65},
    row:{label:'目标所在整条横排',cells:8,multiplier:1.04,splash:.72},
    all:{label:'全场',cells:32,multiplier:.62,splash:.75}
  };

  // First-play roster and six guaranteed story allies have individually authored active kits.
  // Premium prototype heroes: each has ONE signature shape, unique across this set (see docs/HERO_SKILL_SHAPES.md).
  // The other active skill is always a single-target (enemy or ally) tool, so no two heroes share a footprint.
  const sig=(shape,extra={})=>({shape,signature:true,area:skillShapes[shape].label,splash:skillShapes[shape].splash,...extra});
  const featuredSkillSpecs={
    1:[['义旗护阵','guard',3,0,sig('cross5',{shieldRatio:.16,target:'ally_single',area:'友军十字五格'})],['及时援手','heal',3,0,{healRatio:.27,target:'ally_single',area:'一名友军'}]],
    3:[['山路奇计','weaken',4,1.32,{status:'虚弱',duration:2}],['落石伏阵','cleave',3,1.10,sig('column')]],
    4:[['五雷引诀','stun',4,1.10,{status:'眩晕',duration:1}],['呼风唤雨','cleave',4,.62,sig('all',{status:'虚弱',duration:1})]],
    6:[['雪夜回枪','damage',2,1.40,sig('line2')],['禁军破势','stun',2,1.17,{status:'眩晕',duration:1}]],
    9:[['落羽箭雨','cleave',4,1.14,sig('six',{area:'目标为上排中心的两排三列六格'})],['穿杨一箭','damage',4,1.58,{}]],
    22:[['双斧开山','cleave',1,1.22,sig('fan')],['黑旋破胆','weaken',1,1.35,{status:'虚弱',duration:2}]],
    13:[['禅杖震地','cleave',2,1.10,sig('ring8')],['雷音震阵','stun',1,1.22,{status:'眩晕',duration:1}]],
    14:[['醉步连环','cleave',1,1.16,sig('xcross')],['行者压锋','weaken',1,1.31,{status:'虚弱',duration:2}]],
    36:[['相扑锁臂','stun',1,1.44,sig('single',{status:'眩晕',duration:1})],['轻燕折返','damage',2,1.43,{area:'两格内单体'}]],
    59:[['双刀贯阵','pierce',3,1.12,sig('line')],['红绫缚阵','stun',1,1.13,{status:'眩晕',duration:1}]],
    30:[['浪里翻江','cleave',3,1.04,sig('row')],['浪里救援','heal',2,0,{healRatio:.22,target:'ally_single',area:'一名友军'}]],
    37:[['神机伏阵','weaken',4,1.39,{status:'虚弱',duration:2}],['少华石阵','cleave',3,1.00,sig('square9')]]
  };
  const featuredIcons={4:'☁️',1:'🏮',3:'📜',6:'🗡️',9:'🏹',22:'🪓',13:'🦯',14:'🥋',36:'🪭',59:'⚔️',30:'🌊',37:'🧭'};
  for(const [rankText,specs] of Object.entries(featuredSkillSpecs)){
    const rank=Number(rankText),h=heroData[rank-1];
    h.icon=featuredIcons[rank];
    h.skills=specs.map(([name,type,range,multiplier,options],index)=>{
      const target=options.target||'enemy_single',area=options.area||'单体';
      const effect={type,multiplier,area,shape:options.shape||'',signature:!!options.signature,...(options.splash!==undefined?{splash:options.splash}:{}),radius:options.radius||0,status:options.status||'',duration:options.duration||0,healRatio:options.healRatio||0,shieldRatio:options.shieldRatio||0};
      const condition=type==='heal'?`选择射程内${area}，回复生命上限 ${Math.round(effect.healRatio*100)}%`:type==='guard'?`选择射程内${area}，获得生命上限 ${Math.round(effect.shieldRatio*100)}% 的护盾`:`选择射程内${area}，造成${Math.round(multiplier*100)}%攻击伤害${effect.status?`并施加${effect.status} ${effect.duration} 回合`:''}`;
      return {id:`skill-${rank}-${index}`,name,trigger:'主动；每场战斗限用一次',target,range,area,effect,condition,description:`${condition}。`};
    });
    h.designStatus='精品原型：两项原创专属招式，其中一项为独有格形；被动使用职业组';
  }

  const bondList=[
    {id:'bond-brotherhood',name:'替天行道',members:[1,3,9],target:'敌方全体',ratio:.25,trigger:'战斗开始时',description:'宋江、吴用、花荣同队；开场对敌方全体造成全队攻击总和的 25% 伤害。'},
    {id:'bond-righteous',name:'忠义双雄',members:[1,22],target:'敌方前排',ratio:.65,trigger:'战斗开始时',description:'宋江与李逵同队；开场压制敌方前排，造成全队攻击总和的 65% 伤害。'},
    {id:'bond-shaolin',name:'拳杖双绝',members:[6,13],target:'随机两名敌人',ratio:.48,trigger:'战斗开始时',description:'林冲与鲁智深同队；开场各击一名敌人，每击造成全队攻击总和的 48% 伤害。'},
    {id:'bond-marksmen',name:'神箭双璧',members:[9,16],target:'随机两名敌人',ratio:.55,trigger:'战斗开始时',description:'花荣与张清同队；开场远射，每击造成全队攻击总和的 55% 伤害。'},
    {id:'bond-sisters',name:'巾帼并肩',members:[59,101,103],target:'敌方全体',ratio:.32,trigger:'战斗开始时',description:'扈三娘、顾大嫂、孙二娘同队；开场扰乱全体敌人并造成 32% 全队攻击伤害。'}
  ];
  for (const bond of bondList) for (const rank of bond.members) heroData[rank-1].bonds.push(bond.id);

  const chapters=[
    {id:1,name:'山口初会',title:'芦苇荡·巡粮相逢',brief:'宋江召集头领巡看水泊粮道，官军小队沿岸试探。守住浅滩，练习站位、射程与职业克制。',isBoss:false,bossId:null,terrain:'浅滩与芦苇',enemyName:'官军探哨',rewardHeroRank:13,reward:{gold:120,grain:18,gearFragments:3},normal:true,elite:true},
    {id:2,name:'雪夜风云',title:'白虎堂外·旧案新围',brief:'林冲旧案牵出高俅部下的围捕。故事取小说人物关系作战棋改编，并非历史战役复原。',isBoss:true,bossId:'boss-gao-qiu',terrain:'风雪官道',enemyName:'殿帅府追兵',rewardHeroRank:14,reward:{gold:150,grain:20,gearFragments:4},normal:true,elite:true},
    {id:3,name:'黄泥冈奇谋',title:'生辰纲·山路伏击',brief:'吴用安排梁山小队夺取不义财物，山路视野狭窄，分散的护送队会尝试包抄。',isBoss:false,bossId:null,terrain:'黄土山径',enemyName:'押运护卫队',rewardHeroRank:36,reward:{gold:180,grain:24,gearFragments:4},normal:true,elite:true},
    {id:4,name:'祝家庄鏖兵',title:'祝家庄·盘陀迷阵',brief:'梁山军三打祝家庄的演义章节改编。庄丁依赖阵旗互相掩护，先破阵旗护卫再近身攻庄主。',isBoss:true,bossId:'boss-zhu-chaofeng',terrain:'庄院与阵旗',enemyName:'祝家庄联防队',rewardHeroRank:59,reward:{gold:210,grain:26,gearFragments:5},normal:true,elite:true},
    {id:5,name:'曾头市追马',title:'曾头市·毒箭夺马',brief:'小说演义中的曾头市冲突改编。史文恭会标记远处目标，移动与掩护比堆攻击更重要。',isBoss:true,bossId:'boss-shi-wengong',terrain:'草场与箭台',enemyName:'曾头市骑队',rewardHeroRank:30,reward:{gold:250,grain:30,gearFragments:5},normal:true,elite:true},
    {id:6,name:'江南风雷',title:'江南征途·方腊残阵',brief:'依据《水浒传》征方腊段落作结尾章改编；人物战斗和结局属于小说叙事，不作为确定史实。',isBoss:true,bossId:'boss-fang-la',terrain:'江南石寨',enemyName:'江南义军守阵',rewardHeroRank:37,reward:{gold:300,grain:36,gearFragments:6},normal:true,elite:true}
  ];
  const bosses=[
    {id:'boss-gao-qiu',name:'高俅',epithet:'殿帅府权臣',faction:'朝廷追兵',role:'谋士',identity:'小说中的权臣形象；真实历史身份与小说塑造需区分。',rank:'远程指挥首领',hp:1050,atk:34,move:1,range:3,icon:'🎖️',mechanic:'moraleBreak',mechanicName:'督战令',mechanicDescription:'偶数回合在四格内打击最靠前的梁山将领，并使其虚弱 1 回合。',skill:{name:'督战令',type:'weaken',range:4,multiplier:1.10,duration:1},strategy:'让能承伤的战士在前吸引督战令，再由射手与谋士从侧翼逼近后排。',reward:{gold:80,cultivation:18,heroRank:14}},
    {id:'boss-zhu-chaofeng',name:'祝朝奉',epithet:'祝家庄庄主',faction:'祝家庄',role:'战士',identity:'祝家庄首领，战斗细节为本作改编设定。',rank:'护阵首领',hp:1380,atk:39,move:2,range:1,icon:'🏯',mechanic:'formationShield',mechanicName:'盘陀阵旗',mechanicDescription:'任一阵旗护卫存活时，祝朝奉受到的伤害降低 45%；每两回合近身施展「闭门合围」，命中会眩晕 1 回合。',skill:{name:'闭门合围',type:'stun',range:1,multiplier:1.2,duration:1},strategy:'让战士牵制护卫，射手跨区优先击破阵旗单位；护卫全灭后再集火，并留意偶数回合合围。',reward:{gold:110,cultivation:25,heroRank:59}},
    {id:'boss-shi-wengong',name:'史文恭',epithet:'曾头市教师',faction:'曾头市',role:'射手',identity:'小说中的武艺教师与曾头市战力核心；毒箭对决为戏剧化改编。',rank:'标记狙击首领',hp:1260,atk:43,move:2,range:4,icon:'☠️',mechanic:'markedShot',mechanicName:'毒箭点名',mechanicDescription:'偶数回合标记五格内距离最远的友军并射出毒箭；被点名者若未在下一回合移动，会在下次敌方阶段受到额外伤害。',skill:{name:'毒箭穿阵',type:'mark',range:5,multiplier:1.25,duration:2},strategy:'被点名后及时走位；用战士逼近压缩其射击空间，避免脆弱单位停在最远端。',reward:{gold:140,cultivation:30,heroRank:30}},
    {id:'boss-fang-la',name:'方腊',epithet:'江南起事首领',faction:'江南义军',role:'谋士',identity:'方腊起事见于宋代史料；本关阵地与对决编排采用小说及游戏改编。',rank:'阵地统帅',hp:1560,atk:39,move:2,range:3,icon:'🔥',mechanic:'rally',mechanicName:'山寨号令',mechanicDescription:'生命低于 50% 时号令残部：对全体梁山单位造成一次 12% 攻击的范围伤害，并获得 15% 护盾。',skill:{name:'江火连营',type:'burn',range:3,multiplier:.68,duration:2},strategy:'保留一名谋士应对群体伤害；首领半血前攒好护盾与控制，打断其后半程攻势。',reward:{gold:180,cultivation:40,heroRank:37}}
  ];

  const story={
    title:'是好汉就上山',subtitle:'梁山泊·替天行道',dataVersion:2,
    designNote:'以《水浒传》通行小说人物与第七十一回排座次为角色基底；战斗数值、技能、Boss对决和关卡次序属于原创游戏化改编。宋江等少数人物与北宋史料有关，不将小说中的具体战役和情节表述为确定史实。',
    heroes:heroData,skillShapes,bonds:bondList,chapters,bosses,
    activities:[
      {id:'biography',name:'人物列传',reward:'指定好汉信物',objective:'击败列传守将；每次胜利得到好汉信物。'},
      {id:'relief',name:'赈济百姓',reward:'粮草与铜钱',objective:'击退拦粮官兵，夺回运粮通道。'},
      {id:'scholars',name:'探访名士',reward:'修为与粮草',objective:'清除书院路上的伏兵，带回研习资源。'}
    ],
    economy:{recruit:{dailyFree:1,tokenCost:1,rarityRates:{blue:.53,purple:.34,red:.13,diamond:0},eliteCost:30,eliteRates:{red:.83,diamond:.17},tenPullCost:200,tenPullGuarantee:'每次十连至少 1 名暗金；没有真实付费货币接入。'},targetedRecruit:{coinCost:300,duplicateShards:5,shardsToRecruit:30},
      combatRewards:'普通战役胜利获得铜钱、粮草、装备碎片；Boss首胜附加修为和固定信物；试练塔按层数增加修为。'
    },
    combat:{board:'8×4 正交格；曼哈顿距离。每回合每名单位移动一次并攻击或施放一次主动技；主动技每场限用一次。',movement:'移动用 BFS 寻路，高亮步数范围，阻挡被占格。',attack:'伤害 = 攻击 × 技能倍率 × 职业倍率 × 被动倍率；普通攻击基础倍率 1.00，敌方普通攻击倍率 0.72。克制倍率 1.35，被克制 0.78，其他 1.00；虚弱降低施加者造成的伤害 22%。',turns:'我方全员行动或手动结束回合后，敌方按编队依次靠近并攻击；首领于特定回合施展专属技。',states:'眩晕跳过下一次行动；灼烧在敌方阶段造成 8% 最大生命伤害并递减；虚弱使施加者攻击伤害降低 22%；攻击削弱按技能参数降低攻击；护盾先吸收伤害。',auto:'自动战斗优先处理可攻击目标，移动到最近敌人射程内后攻击，必要时自动释放名将技。'},
    sources:[
      {title:'《水滸傳》120回本第七十一回（座次与绰号的文学文本）',url:'https://zh.wikisource.org/wiki/%E6%B0%B4%E6%BB%B8%E5%82%B3_%28120%E5%9B%9E%E6%9C%AC%29/%E7%AC%AC071%E5%9B%9E'},
      {title:'《水浒传》108将座次与绰号整理（辅助对照）',url:'https://shuihu.5000yan.com/108/'},
      {title:'《宋史》卷二十二·徽宗本纪（历史背景）',url:'https://zh.wikisource.org/zh-hant/%E5%AE%8B%E5%8F%B2/%E5%8D%B7022'},
      {title:'日本国立公文书馆：宋史及宋江见载说明',url:'https://www.archives.go.jp/exhibition/digital/rekishitomonogatari/contents/56.html'}
    ]
  };
  window.SHUIHU_DATA=story;
})();
