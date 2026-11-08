import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
  Vec3,
  director,
  resources,
  sys,
  tween,
  view,
} from 'cc';

const { ccclass } = _decorator;

type Role = '战士' | '射手' | '谋士';
type EquipmentSlot = '武器' | '护甲' | '饰品';
type GearData = { id: string; name: string; slot: EquipmentSlot; tier: number; level: number; attack: number; hp: number };
type BattleMode = 'story' | 'training' | 'tower' | 'arena' | 'event';
type EventObjective = 'defeat' | 'escort' | 'collect';
type SkillOption = { id: string; name: string; description: string };
type UnitData = {
  id: string;
  name: string;
  role: Role;
  art: string;
  team: 'ally' | 'enemy' | 'objective';
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  attack: number;
  move: number;
  range: number;
  moved: boolean;
  acted: boolean;
  alive: boolean;
  stunnedTurns: number;
  counterReady: boolean;
};

const PALETTE = {
  ink: new Color(62, 48, 45, 255),
  cream: new Color(255, 246, 224, 255),
  paper: new Color(255, 250, 239, 248),
  gold: new Color(247, 195, 105, 255),
  coral: new Color(218, 105, 103, 255),
  jade: new Color(91, 166, 132, 255),
  paleJade: new Color(121, 216, 169, 115),
  paleRed: new Color(235, 107, 101, 122),
  paleGold: new Color(255, 219, 117, 145),
};

const ACTIVE_SKILLS: Record<string, SkillOption[]> = {
  'liu-bei': [
    { id: 'double-swords', name: '双股剑势', description: '对目标造成高额单体伤害' },
    { id: 'benevolence', name: '仁德援护', description: '不攻击，治疗生命比例最低的友军' },
  ],
  'guan-yu': [
    { id: 'green-dragon', name: '青龙斩', description: '均衡的强力单体斩击' },
    { id: 'moon-cleaver', name: '偃月重击', description: '消耗行动，造成更高单体伤害' },
  ],
  'zhang-fei': [
    { id: 'yanren-charge', name: '燕人破阵', description: '重击目标并触发被动眩晕' },
    { id: 'thunder-sweep', name: '震天横扫', description: '攻击目标并波及相邻敌军' },
  ],
  'zhao-yun': [
    { id: 'dragon-thrust', name: '龙胆突刺', description: '强力突刺，适合正面破敌' },
    { id: 'seven-advances', name: '七进七出', description: '攻击后闪至目标附近空格' },
  ],
  'huang-zhong': [
    { id: 'piercing-shot', name: '百步穿杨', description: '远距离单体精准射击' },
    { id: 'triple-volley', name: '烈弓三连', description: '连续三箭，适合收割残血' },
  ],
};

@ccclass('GameRoot')
export class GameRoot extends Component {
  private canvasNode: Node | null = null;
  private frames: Record<string, SpriteFrame> = {};
  private screenW = 1920;
  private screenH = 1080;
  private page: 'city' | 'battle' | 'result' = 'city';
  private modal: Node | null = null;
  private cityGold = 1800;
  private cityJade = 260;
  private cultivation = 36;
  private freeRecruit = true;
  private guideLine = '';
  private guideLabel: Label | null = null;
  private selectedCard: Node | null = null;
  private turnLabel: Label | null = null;
  private objectiveLabel: Label | null = null;
  private selectedId = 'guan-yu';
  private activeSkill = false;
  private autoMode = false;
  private turn = 1;
  private stageName = '长坂坡 · 黄巾来袭';
  private unlockedChapter = 0;
  private campaignStage = -1;
  private battleMode: BattleMode = 'story';
  private battleEvent = '';
  private eventObjective: EventObjective = 'defeat';
  private scrollCells: string[] = [];
  private collectedScrolls = 0;
  private readonly escortUnitId = 'escort-emperor';
  private towerFloor = 1;
  private arenaPoints = 0;
  private arenaHonor = 0;
  private arenaWinStreak = 0;
  private readonly eventAttempts: Record<string, number> = { '名将列传': 5, '营救献帝': 5, '云游隆中': 5 };
  private generalFragments = 0;
  private tigerTalismans = 0;
  private equipmentLevel = 0;
  private equipmentTier = 1;
  private equipmentBlueprints = 0;
  private gearInventory: GearData[] = [];
  private equippedGear: Record<string, Partial<Record<EquipmentSlot, string>>> = {};
  private selectedGearHeroId = 'liu-bei';
  private gearSerial = 0;
  private skillLevels: Record<string, number> = {};
  private skillLoadouts: Record<string, string> = {};
  private dailyResetKey = '';
  private phase: 'player' | 'enemy' = 'player';
  private boardTop = 276;
  private boardWidth = 1520;
  private boardHeight = 560;
  private cellNodes: Node[][] = [];
  private unitViews = new Map<string, Node>();
  private unitHealth = new Map<string, Node>();
  private units: UnitData[] = [];
  private lineup = ['liu-bei', 'guan-yu', 'zhang-fei'];
  private readonly recruitPool = [
    { id: 'zhao-yun', name: '赵云', role: '战士' as Role, art: 'hero-xiaofeng', hp: 510, attack: 101, move: 3, range: 1 },
    { id: 'huang-zhong', name: '黄忠', role: '射手' as Role, art: 'hero-tuantuan', hp: 390, attack: 98, move: 2, range: 3 },
  ];
  private allyRoster = [
    { id: 'liu-bei', name: '刘备', role: '谋士' as Role, art: 'hero-liubei', hp: 410, attack: 76, move: 2, range: 3 },
    { id: 'guan-yu', name: '关羽', role: '战士' as Role, art: 'hero-guanyu', hp: 520, attack: 104, move: 3, range: 1 },
    { id: 'zhang-fei', name: '张飞', role: '战士' as Role, art: 'hero-zhangfei', hp: 560, attack: 96, move: 3, range: 1 },
  ];

  onLoad() {
    view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
    this.loadGame();
    const scene = director.getScene();
    if (!scene) return;

    const cameraNode = scene.getChildByName('Main Camera');
    const camera = cameraNode?.getComponent(Camera) ?? null;
    if (camera && cameraNode) {
      camera.projection = Camera.ProjectionType.ORTHO;
      camera.orthoHeight = 1080;
      camera.near = 1;
      camera.far = 2200;
      camera.priority = 20;
      camera.visibility = Layers.Enum.ALL;
      camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
      camera.clearColor = new Color(37, 33, 41, 255);
      cameraNode.setPosition(0, 0, 1200);
      cameraNode.setRotationFromEuler(0, 0, 0);
    }

    this.canvasNode = new Node('GameCanvas');
    this.canvasNode.layer = Layers.Enum.UI_2D;
    scene.addChild(this.canvasNode);
    const canvasTransform = this.canvasNode.addComponent(UITransform);
    canvasTransform.setContentSize(1920, 1080);
    const canvas = this.canvasNode.addComponent(Canvas);
    canvas.alignCanvasWithScreen = true;
    canvas.cameraComponent = camera;
    this.refreshSize();
    this.loadFrames(() => this.renderCity());
  }

  private refreshSize() {
    const visible = view.getVisibleSize();
    this.screenW = Math.max(1920, visible.width);
    this.screenH = Math.max(1080, visible.height);
  }

  private todayKey() {
    const now = new Date();
    const month = `0${now.getMonth() + 1}`.slice(-2);
    const day = `0${now.getDate()}`.slice(-2);
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private loadGame() {
    try {
      const raw = sys.localStorage?.getItem('taohua-shanhai-save-v1');
      if (!raw) {
        this.dailyResetKey = this.todayKey();
        return;
      }
      const saved = JSON.parse(raw);
      const numberOr = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      this.cityGold = numberOr(saved.cityGold, this.cityGold);
      this.cityJade = numberOr(saved.cityJade, this.cityJade);
      this.cultivation = numberOr(saved.cultivation, this.cultivation);
      this.freeRecruit = typeof saved.freeRecruit === 'boolean' ? saved.freeRecruit : this.freeRecruit;
      this.unlockedChapter = Math.max(0, Math.min(2, numberOr(saved.unlockedChapter, this.unlockedChapter)));
      this.towerFloor = Math.max(1, numberOr(saved.towerFloor, this.towerFloor));
      this.arenaPoints = numberOr(saved.arenaPoints, this.arenaPoints);
      this.arenaHonor = numberOr(saved.arenaHonor, this.arenaHonor);
      this.arenaWinStreak = numberOr(saved.arenaWinStreak, this.arenaWinStreak);
      this.generalFragments = numberOr(saved.generalFragments, this.generalFragments);
      this.tigerTalismans = numberOr(saved.tigerTalismans, this.tigerTalismans);
      this.equipmentLevel = Math.max(0, Math.min(3, numberOr(saved.equipmentLevel, this.equipmentLevel)));
      this.equipmentTier = Math.max(1, Math.min(3, numberOr(saved.equipmentTier, this.equipmentTier)));
      this.equipmentBlueprints = numberOr(saved.equipmentBlueprints, this.equipmentBlueprints);
      if (Array.isArray(saved.gearInventory)) {
        this.gearInventory = saved.gearInventory.filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string' && ['武器', '护甲', '饰品'].indexOf(item.slot) !== -1);
      }
      if (saved.equippedGear && typeof saved.equippedGear === 'object') this.equippedGear = saved.equippedGear;
      this.gearSerial = numberOr(saved.gearSerial, this.gearInventory.length);
      if (Array.isArray(saved.allyRoster)) {
        const savedHeroes = saved.allyRoster.filter((hero: any) => hero && typeof hero.id === 'string' && typeof hero.name === 'string' && typeof hero.art === 'string');
        if (savedHeroes.length > 0) this.allyRoster = savedHeroes;
      }
      if (Array.isArray(saved.lineup)) {
        const savedLineup = saved.lineup.filter((id: unknown) => typeof id === 'string' && this.allyRoster.some(hero => hero.id === id)).slice(0, 3);
        if (savedLineup.length > 0) this.lineup = savedLineup;
      }
      if (saved.skillLevels && typeof saved.skillLevels === 'object') this.skillLevels = saved.skillLevels;
      if (saved.skillLoadouts && typeof saved.skillLoadouts === 'object') {
        Object.keys(ACTIVE_SKILLS).forEach(heroId => {
          const selected = saved.skillLoadouts[heroId];
          if (ACTIVE_SKILLS[heroId].some(option => option.id === selected)) this.skillLoadouts[heroId] = selected;
        });
      }
      this.dailyResetKey = typeof saved.dailyResetKey === 'string' ? saved.dailyResetKey : '';
      if (saved.eventAttempts && typeof saved.eventAttempts === 'object' && this.dailyResetKey === this.todayKey()) {
        Object.keys(this.eventAttempts).forEach(name => {
          this.eventAttempts[name] = Math.max(0, Math.min(5, numberOr(saved.eventAttempts[name], 5)));
        });
      } else {
        Object.keys(this.eventAttempts).forEach(name => this.eventAttempts[name] = 5);
        this.dailyResetKey = this.todayKey();
      }
    } catch (error) {
      this.dailyResetKey = this.todayKey();
      console.warn('[桃源仙都] 读取本地存档失败，将使用新手进度。', error);
    }
  }

  private saveGame() {
    try {
      sys.localStorage?.setItem('taohua-shanhai-save-v1', JSON.stringify({
        cityGold: this.cityGold,
        cityJade: this.cityJade,
        cultivation: this.cultivation,
        freeRecruit: this.freeRecruit,
        unlockedChapter: this.unlockedChapter,
        towerFloor: this.towerFloor,
        arenaPoints: this.arenaPoints,
        arenaHonor: this.arenaHonor,
        arenaWinStreak: this.arenaWinStreak,
        generalFragments: this.generalFragments,
        tigerTalismans: this.tigerTalismans,
        equipmentLevel: this.equipmentLevel,
        equipmentTier: this.equipmentTier,
        equipmentBlueprints: this.equipmentBlueprints,
        gearInventory: this.gearInventory,
        equippedGear: this.equippedGear,
        gearSerial: this.gearSerial,
        skillLevels: this.skillLevels,
        skillLoadouts: this.skillLoadouts,
        allyRoster: this.allyRoster,
        lineup: this.lineup,
        dailyResetKey: this.dailyResetKey || this.todayKey(),
        eventAttempts: this.eventAttempts,
      }));
    } catch (error) {
      console.warn('[桃源仙都] 保存进度失败。', error);
    }
  }

  private loadFrames(onComplete: () => void) {
    const assets = [
      'city-peachlight', 'battle-grid-cute', 'battle-grid', 'hero-liubei', 'hero-guanyu', 'hero-zhangfei',
      'hero-taoyao', 'hero-xiaofeng', 'hero-tuantuan',
    ];
    let left = assets.length;
    for (const key of assets) {
      resources.load(`images/${key}/spriteFrame`, SpriteFrame, (err, frame) => {
        if (!err && frame) this.frames[key] = frame;
        left -= 1;
        if (left === 0) onComplete();
      });
    }
  }

  private size(node: Node, width: number, height: number) {
    node.layer = Layers.Enum.UI_2D;
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return node;
  }

  private child(parent: Node, name: string, x = 0, y = 0, width = 1, height = 1, z = 0) {
    const node = new Node(name);
    parent.addChild(node);
    this.size(node, width, height);
    node.setPosition(x, y, z);
    return node;
  }

  private clearCanvas() {
    if (!this.canvasNode) return;
    for (const child of [...this.canvasNode.children]) child.destroy();
    this.modal = null;
    this.guideLabel = null;
    this.selectedCard = null;
    this.turnLabel = null;
    this.objectiveLabel = null;
    this.cellNodes = [];
    this.unitViews.clear();
    this.unitHealth.clear();
  }

  private plate(parent: Node, name: string, x: number, y: number, width: number, height: number, color: Color, radius = 18, border?: Color) {
    const node = this.child(parent, name, x, y, width, height);
    const shape = node.addComponent(Graphics);
    shape.fillColor = color;
    shape.roundRect(-width / 2, -height / 2, width, height, radius);
    shape.fill();
    if (border) {
      shape.lineWidth = 2;
      shape.strokeColor = border;
      shape.roundRect(-width / 2, -height / 2, width, height, radius);
      shape.stroke();
    }
    return node;
  }

  private label(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, fontSize = 24, color = PALETTE.ink, bold = false) {
    const node = this.child(parent, name, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.2;
    label.color = color;
    label.isBold = bold;
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }

  private sprite(parent: Node, name: string, frameKey: string, x: number, y: number, width: number, height: number, z = 0) {
    const node = this.child(parent, name, x, y, width, height, z);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const frame = this.frames[frameKey];
    if (frame) sprite.spriteFrame = frame;
    else resources.load(`images/${frameKey}/spriteFrame`, SpriteFrame, (err, loaded) => {
      if (!err && loaded && node.isValid) sprite.spriteFrame = loaded;
    });
    return node;
  }

  private actionButton(parent: Node, title: string, x: number, y: number, width: number, height: number, action: () => void, fill = PALETTE.coral, fontSize = 22) {
    const button = this.plate(parent, `Button-${title}`, x, y, width, height, fill, 18, new Color(255, 250, 232, 190));
    this.label(button, 'Title', title, 0, 0, width - 24, height - 10, fontSize, PALETTE.cream, true);
    button.on(Node.EventType.TOUCH_END, action, this);
    return button;
  }

  private background(frameKey: string) {
    if (!this.canvasNode) return;
    const bg = this.sprite(this.canvasNode, 'Scene-Background', frameKey, 0, 0, this.screenW, this.screenH, -100);
    bg.setSiblingIndex(0);
  }

  private renderCity() {
    if (!this.canvasNode) return;
    this.page = 'city';
    this.clearCanvas();
    this.background('city-peachlight');
    const edge = this.screenW / 2;

    this.plate(this.canvasNode, 'Top-Glass', 0, this.screenH / 2 - 78, this.screenW - 64, 112, new Color(40, 49, 51, 210), 26, new Color(255, 245, 214, 110));
    this.plate(this.canvasNode, 'Player-Crest', -edge + 100, this.screenH / 2 - 76, 126, 76, new Color(255, 232, 183, 235), 24, new Color(255, 253, 231, 255));
    this.label(this.canvasNode, 'Crest-Text', '桃', -edge + 100, this.screenH / 2 - 76, 100, 68, 36, new Color(178, 82, 83, 255), true);
    this.label(this.canvasNode, 'Player-Name', '桃花主公 · Lv.3', -edge + 270, this.screenH / 2 - 55, 250, 34, 24, PALETTE.cream, true);
    this.label(this.canvasNode, 'Chapter-Name', '第一章  黄巾初乱', -edge + 270, this.screenH / 2 - 91, 250, 28, 18, new Color(248, 208, 135, 255));

    const resourcesX = edge - 380;
    this.resourceChip('铜钱', this.cityGold.toString(), resourcesX, this.screenH / 2 - 76, new Color(255, 224, 160, 255));
    this.resourceChip('粮草', '120', resourcesX + 150, this.screenH / 2 - 76, new Color(181, 225, 166, 255));
    this.resourceChip('元宝', this.cityJade.toString(), resourcesX + 300, this.screenH / 2 - 76, new Color(180, 218, 233, 255));

    const buildingY = 68;
    const buildings = [
      ['桃花酒馆', '招贤纳士', -edge + 225, '酒'],
      ['金阙点将台', '编队养成', -edge + 530, '将'],
      ['观星试练塔', '登高取宝', 0, '星'],
      ['演武校场', '挑战群雄', edge - 530, '武'],
      ['云集商铺', '装备信物', edge - 225, '集'],
    ] as const;
    for (const [name, sub, x, icon] of buildings) {
      const card = this.plate(this.canvasNode, `Building-${name}`, x, buildingY, 208, 104, new Color(255, 247, 224, 228), 25, new Color(255, 255, 243, 255));
      this.plate(card, 'Building-Icon', -70, 4, 56, 56, new Color(234, 179, 110, 255), 18);
      this.label(card, 'Building-Icon-Text', icon, -70, 4, 48, 48, 25, PALETTE.cream, true);
      this.label(card, 'Building-Name', name, 34, 18, 118, 34, 20, PALETTE.ink, true);
      this.label(card, 'Building-Subtitle', sub, 34, -17, 118, 26, 15, new Color(135, 100, 74, 255));
      card.on(Node.EventType.TOUCH_END, () => this.openBuilding(name), this);
    }

    this.sprite(this.canvasNode, 'Taoyao-Mascot', 'hero-taoyao', -190, -202, 244, 304, 1);
    this.sprite(this.canvasNode, 'Liu-Bei-City', 'hero-liubei', 142, -222, 220, 306, 2);
    this.sprite(this.canvasNode, 'Zhang-Fei-City', 'hero-zhangfei', 412, -225, 210, 300, 1);

    const quest = this.plate(this.canvasNode, 'Quest-Card', 0, -this.screenH / 2 + 120, 690, 120, new Color(255, 247, 224, 238), 28, new Color(255, 255, 242, 255));
    this.label(quest, 'Quest-Title', '征途开启 · 桃园结义', -112, 24, 380, 34, 24, PALETTE.ink, true);
    this.label(quest, 'Quest-Subtitle', '率领三位伙伴，迎战长坂坡黄巾军', -112, -16, 390, 28, 17, new Color(134, 94, 73, 255));
    this.actionButton(quest, '出征', 248, 0, 152, 74, () => this.openCampaign(), new Color(205, 91, 86, 255), 25);

    this.plate(this.canvasNode, 'Bottom-Nav', 0, -this.screenH / 2 + 35, Math.min(850, this.screenW - 80), 58, new Color(48, 55, 57, 205), 26);
    const nav = [
      ['城池', () => this.renderCity()],
      ['武将', () => this.openBuilding('金阙点将台')],
      ['征战', () => this.openCampaign()],
      ['招募', () => this.openBuilding('桃花酒馆')],
      ['更多', () => this.openBuilding('更多玩法')],
    ] as const;
    const navX = -286;
    nav.forEach(([text, handler], index) => {
      const btn = this.child(this.canvasNode!, `Nav-${text}`, navX + index * 143, -this.screenH / 2 + 35, 128, 48);
      this.label(btn, `${text}-Label`, text, 0, 0, 120, 42, 18, index === 0 ? PALETTE.gold : PALETTE.cream, true);
      btn.on(Node.EventType.TOUCH_END, handler, this);
    });

    this.addHint('桃灵', '点「出征」进入战棋。可直接点亮棋格移动，点敌方单位发起攻击。', this.screenH / 2 - 188);
  }

  private resourceChip(name: string, value: string, x: number, y: number, tint: Color) {
    const chip = this.plate(this.canvasNode!, `Resource-${name}`, x, y, 138, 62, new Color(255, 250, 234, 238), 21, new Color(255, 255, 247, 255));
    this.plate(chip, 'Resource-Dot', -48, 0, 36, 36, tint, 18);
    this.label(chip, 'Resource-Name', name, 14, 12, 76, 22, 13, new Color(120, 95, 67, 255));
    this.label(chip, 'Resource-Count', value, 16, -11, 78, 26, 18, PALETTE.ink, true);
  }

  private addHint(name: string, text: string, y = -this.screenH / 2 + 142) {
    const width = Math.min(850, this.screenW * 0.56);
    const box = this.plate(this.canvasNode!, 'Guide-Bubble', -this.screenW / 2 + width / 2 + 48, y, width, 68, new Color(255, 249, 231, 242), 20, new Color(255, 255, 245, 255));
    this.label(box, 'Guide-Avatar', '桃', -width / 2 + 30, 0, 54, 52, 25, new Color(200, 91, 95, 255), true);
    this.label(box, 'Guide-Name', name, -width / 2 + 102, 16, 78, 22, 14, new Color(190, 93, 92, 255), true);
    this.guideLabel = this.label(box, 'Guide-Text', text, width / 2 - width * 0.46, -8, width * 0.76, 42, 15, new Color(103, 79, 62, 255));
  }

  private selectedSkill(heroId: string): SkillOption {
    const options = ACTIVE_SKILLS[heroId] ?? [];
    const selectedId = this.skillLoadouts[heroId];
    return options.find(option => option.id === selectedId) ?? options[0] ?? { id: 'general-strike', name: '名将奇策', description: '发动强力攻击' };
  }

  private cycleActiveSkill(heroId: string) {
    const options = ACTIVE_SKILLS[heroId] ?? [];
    if (options.length < 2) return;
    const currentIndex = options.findIndex(option => option.id === this.selectedSkill(heroId).id);
    const next = options[(currentIndex + 1) % options.length];
    this.skillLoadouts[heroId] = next.id;
    this.saveGame();
    this.showModal('金阙点将台');
    const hero = this.allyRoster.find(item => item.id === heroId);
    this.showToast(`${hero?.name ?? '武将'}已切换名将技：${next.name}`);
  }

  private skillName(heroId: string) {
    return this.selectedSkill(heroId).name;
  }

  private passiveName(heroId: string) {
    const names: Record<string, string> = {
      'liu-bei': '仁心庇护', 'guan-yu': '青龙偃月', 'zhang-fei': '雷霆怒吼',
      'zhao-yun': '龙胆护主', 'huang-zhong': '百步穿杨',
    };
    return names[heroId] ?? '武将天赋';
  }

  private passiveDescription(heroId: string) {
    const descriptions: Record<string, string> = {
      'liu-bei': '相邻友军受到伤害降低 20%',
      'guan-yu': '攻击高血量敌人时伤害提高 20%',
      'zhang-fei': '名将技命中后令敌人眩晕 1 回合',
      'zhao-yun': '受击后蓄势，下次攻击提高 40%',
      'huang-zhong': '射程 +1，远距离攻击提高 25%',
    };
    return descriptions[heroId] ?? '上阵后生效的专属天赋';
  }

  private gearFor(heroId: string, slot: EquipmentSlot) {
    const id = this.equippedGear[heroId]?.[slot];
    return this.gearInventory.find(item => item.id === id);
  }

  private gearBonuses(heroId: string) {
    const total = { attack: 0, hp: 0 };
    const slots: EquipmentSlot[] = ['武器', '护甲', '饰品'];
    for (const slot of slots) {
      const item = this.gearFor(heroId, slot);
      if (!item) continue;
      const perLevelAttack = item.slot === '武器' ? 6 : item.slot === '饰品' ? 3 : 0;
      const perLevelHp = item.slot === '护甲' ? 35 : item.slot === '饰品' ? 15 : 0;
      total.attack += item.attack + perLevelAttack * item.level;
      total.hp += item.hp + perLevelHp * item.level;
    }
    return total;
  }

  private isGearEquipped(gearId: string) {
    for (const heroId of Object.keys(this.equippedGear)) {
      const slots = this.equippedGear[heroId];
      if (slots && (slots['武器'] === gearId || slots['护甲'] === gearId || slots['饰品'] === gearId)) return true;
    }
    return false;
  }

  private gearLabel(item: GearData | undefined) {
    if (!item) return '尚未装备';
    const parts: string[] = [];
    if (item.attack > 0) parts.push(`攻 +${item.attack + (item.slot === '武器' ? item.level * 6 : item.slot === '饰品' ? item.level * 3 : 0)}`);
    if (item.hp > 0) parts.push(`命 +${item.hp + (item.slot === '护甲' ? item.level * 35 : item.slot === '饰品' ? item.level * 15 : 0)}`);
    return `${item.name} · 阶${item.tier} · ${parts.join(' · ')} · +${item.level}`;
  }

  private enemyGroupName() {
    if (this.battleMode === 'tower') return '守塔军';
    if (this.battleMode === 'arena') return '演武对手';
    if (this.battleMode === 'event') return `${this.battleEvent}敌军`;
    if (this.battleMode === 'training') return '校场陪练';
    if (this.campaignStage === 1) return '西凉军';
    if (this.campaignStage === 2) return '曹军';
    return '黄巾军';
  }

  private openBuilding(name: string) {
    if (this.page !== 'city') return;
    if (name === '演武校场') {
      this.startBattle('演武校场 · 练兵', -1, 'training');
      return;
    }
    this.showModal(name);
  }

  private openCampaign() {
    if (this.page !== 'city') return;
    this.showModal('征战篇章');
  }

  private showModal(title: string) {
    if (!this.canvasNode) return;
    this.modal?.destroy();
    const dim = this.plate(this.canvasNode, 'Modal-Dim', 0, 0, this.screenW, this.screenH, new Color(22, 27, 33, 164), 0);
    dim.setSiblingIndex(this.canvasNode.children.length - 1);
    this.modal = dim;
    const cardHeight = title === '金阙点将台' ? 680 : 580;
    const card = this.plate(dim, 'Modal-Card', 0, 0, 820, cardHeight, new Color(255, 248, 229, 255), 36, new Color(255, 255, 246, 255));
    this.label(card, 'Modal-Title', title, 0, 226, 700, 52, 32, new Color(153, 83, 70, 255), true);
    const close = this.actionButton(card, '✕', 350, 238, 54, 54, () => { dim.destroy(); this.modal = null; }, new Color(186, 102, 91, 255), 22);
    close.setSiblingIndex(card.children.length - 1);

    if (title === '征战篇章') {
      this.label(card, 'Campaign-Intro', '沿着三国时间线出发，每一关都是新的战棋布阵。', 0, 174, 680, 32, 17, new Color(123, 94, 68, 255));
      const chapters = [
        ['第一章 · 黄巾初乱', '颖川郡外 · 护送乡民，击退黄巾先锋', '黄巾来袭'],
        ['第二章 · 虎牢问阵', '汜水关前 · 破盾推进，迎战西凉军', '虎牢关 · 西凉军阵'],
        ['第三章 · 长坂夜袭', '当阳桥边 · 护住百姓，拦截追兵', '长坂坡 · 夜袭追兵'],
      ] as const;
      chapters.forEach(([name, desc, stage], index) => {
        const y = 86 - index * 128;
        const unlocked = index <= this.unlockedChapter;
        const row = this.plate(card, `Campaign-${index}`, 0, y, 690, 106, unlocked ? new Color(255, 253, 245, 255) : new Color(241, 235, 221, 245), 20, new Color(231, 212, 174, 255));
        this.plate(row, 'Chapter-Badge', -287, 0, 64, 64, unlocked ? new Color(230, 184, 105, 255) : new Color(167, 161, 150, 255), 22);
        this.label(row, 'Chapter-Number', `${index + 1}`, -287, 0, 48, 52, 24, PALETTE.cream, true);
        this.label(row, 'Chapter-Name', name, -92, 24, 300, 28, 21, PALETTE.ink, true);
        this.label(row, 'Chapter-Description', desc, -88, -13, 330, 24, 14, new Color(119, 92, 72, 255));
        this.actionButton(row, unlocked ? '进入战场' : '尚未开放', 246, 0, 130, 50, () => {
          if (!unlocked) return;
          this.campaignStage = index;
          this.startBattle(`${stage} · 战棋`, index);
        }, unlocked ? new Color(205, 91, 86, 255) : new Color(142, 137, 126, 255), 15);
      });
    } else if (title === '观星试练塔') {
      this.label(card, 'Tower-Intro', '拾级登高，击退守塔军，逐层领取铜钱与修为。', 0, 163, 690, 32, 18, new Color(123, 94, 68, 255));
      this.plate(card, 'Tower-Floor-Crest', 0, 42, 210, 132, new Color(238, 211, 153, 255), 54, new Color(255, 255, 241, 255));
      this.label(card, 'Tower-Floor', `第 ${this.towerFloor} 层`, 0, 46, 190, 50, 36, new Color(153, 83, 70, 255), true);
      this.label(card, 'Tower-Reward', `首胜奖励：${120 + this.towerFloor * 35} 铜钱 · ${10 + this.towerFloor * 2} 修为`, 0, -57, 640, 36, 19, new Color(170, 111, 51, 255), true);
      this.actionButton(card, '挑战本层', 0, -167, 270, 66, () => this.startBattle(`观星试练塔 · 第 ${this.towerFloor} 层`, -1, 'tower'), new Color(205, 91, 86, 255), 22);
    } else if (title === '竞技场') {
      this.label(card, 'Arena-Intro', '与同级演武幻影切磋，连胜会提高积分奖励。', 0, 163, 690, 32, 18, new Color(123, 94, 68, 255));
      const stats = [
        [`${this.arenaPoints}`, '竞技积分'], [`${this.arenaHonor}`, '荣誉值'], [`${this.arenaWinStreak}`, '当前连胜'],
      ];
      stats.forEach(([value, label], index) => {
        const x = -218 + index * 218;
        this.plate(card, `Arena-Stat-${index}`, x, 44, 190, 112, new Color(255, 253, 245, 255), 22, new Color(231, 212, 174, 255));
        this.label(card, `Arena-Value-${index}`, value, x, 58, 164, 42, 28, new Color(153, 83, 70, 255), true);
        this.label(card, `Arena-Label-${index}`, label, x, 18, 164, 28, 16, new Color(119, 92, 72, 255));
      });
      this.actionButton(card, '开始切磋', 0, -38, 270, 58, () => this.startBattle('竞技场 · 演武切磋', -1, 'arena'), new Color(205, 91, 86, 255), 20);
      this.label(card, 'Arena-Shop-Title', '积分商城', 0, -99, 500, 28, 16, new Color(128, 100, 76, 255), true);
      this.actionButton(card, '30 积分 · 5 信物', -159, -155, 248, 52, () => this.redeemArenaItem('fragments'), new Color(85, 143, 129, 255), 15);
      this.actionButton(card, '20 积分 · 20 修为', 159, -155, 248, 52, () => this.redeemArenaItem('cultivation'), new Color(153, 130, 102, 255), 15);
      this.label(card, 'Arena-Shop-Hint', '胜利获得积分与荣誉，连胜额外加分。', 0, -224, 590, 26, 14, new Color(128, 100, 76, 255));
    } else if (title === '活动副本') {
      this.label(card, 'Event-Intro', '每日每项各有 5 次挑战，掉落各类成长资源。', 0, 169, 690, 30, 17, new Color(123, 94, 68, 255));
      const events: Array<[string, string, string]> = [
        ['名将列传', '击败守关名将', '信物'],
        ['营救献帝', '保护车驾抵达终点', '铜钱'],
        ['云游隆中', '搜集散落的三卷兵书', '修为'],
      ];
      events.forEach(([name, desc, reward], index) => {
        const y = 84 - index * 140;
        const row = this.plate(card, `Event-${name}`, 0, y, 690, 112, new Color(255, 253, 245, 255), 20, new Color(231, 212, 174, 255));
        this.label(row, 'Event-Name', name, -175, 24, 230, 30, 22, PALETTE.ink, true);
        this.label(row, 'Event-Desc', `${desc} · 主要掉落：${reward}`, -116, -16, 350, 25, 15, new Color(119, 92, 72, 255));
        const remaining = this.eventAttempts[name] ?? 0;
        this.actionButton(row, remaining > 0 ? `挑战 ${remaining}/5` : '今日已完成', 244, 0, 140, 54,
          () => this.enterEvent(name), remaining > 0 ? new Color(205, 91, 86, 255) : new Color(142, 137, 126, 255), 15);
      });
    } else if (title === '云集商铺') {
      if (!this.allyRoster.some(hero => hero.id === this.selectedGearHeroId)) this.selectedGearHeroId = this.allyRoster[0]?.id ?? '';
      const chosenHero = this.allyRoster.find(hero => hero.id === this.selectedGearHeroId);
      this.label(card, 'Gear-Subtitle', '点选武将，为每位名将搭配独立的三件装备。', 0, 187, 700, 26, 15, new Color(123, 94, 68, 255));
      this.allyRoster.forEach((hero, index) => {
        const x = -260 + index * 130;
        const isSelected = hero.id === this.selectedGearHeroId;
        this.actionButton(card, `${isSelected ? '✓ ' : ''}${hero.name}`, x, 151, 116, 42,
          () => { this.selectedGearHeroId = hero.id; this.showModal('云集商铺'); },
          isSelected ? new Color(205, 91, 86, 255) : new Color(153, 130, 102, 255), 14);
      });
      const slots: EquipmentSlot[] = ['武器', '护甲', '饰品'];
      slots.forEach((slot, index) => {
        const y = 69 - index * 89;
        const row = this.plate(card, `Gear-Slot-${slot}`, 0, y, 712, 78, new Color(255, 253, 245, 255), 18, new Color(231, 212, 174, 255));
        const equipped = chosenHero ? this.gearFor(chosenHero.id, slot) : undefined;
        const cost = (slot === '武器' ? 420 : slot === '护甲' ? 380 : 350) * this.equipmentTier;
        this.label(row, 'Gear-Slot-Name', slot, -294, 12, 120, 25, 16, PALETTE.ink, true);
        this.label(row, 'Gear-Slot-Item', this.gearLabel(equipped), -95, 0, 250, 48, 12, new Color(119, 92, 72, 255));
        this.actionButton(row, `打造 ${cost}`, 136, 0, 78, 43, () => this.craftGear(this.selectedGearHeroId, slot), new Color(205, 91, 86, 255), 11);
        const availableCount = this.gearInventory.filter(item => item.slot === slot && !this.isGearEquipped(item.id)).length;
        this.actionButton(row, `换装${availableCount ? ` ${availableCount}` : ''}`, 225, 0, 83, 43,
          () => this.cycleGear(this.selectedGearHeroId, slot), new Color(85, 143, 129, 255), 12);
        this.actionButton(row, equipped && equipped.level < 3 ? `强化 ${120 * (equipped.level + 1) * equipped.tier}` : equipped ? '满级' : '强化', 317, 0, 84, 43,
          () => this.upgradeGear(this.selectedGearHeroId, slot), equipped && equipped.level < 3 ? new Color(150, 104, 178, 255) : new Color(142, 137, 126, 255), 11);
      });
      const allAttack = this.equipmentLevel * 7 + (this.equipmentTier - 1) * 10;
      const allHp = this.equipmentLevel * 18 + (this.equipmentTier - 1) * 30;
      const nextCost = (this.equipmentLevel + 1) * 250;
      const heroGearBonus = this.gearBonuses(chosenHero?.id ?? '');
      this.label(card, 'Gear-Inventory', `铜钱 ${this.cityGold} · 图纸 ${this.equipmentBlueprints} · ${chosenHero?.name ?? '武将'}装备攻 +${heroGearBonus.attack} / 生命 +${heroGearBonus.hp} · 全队军备 ${this.equipmentTier}阶 +${this.equipmentLevel}/3`, 0, -166, 700, 25, 12, new Color(170, 111, 51, 255));
      const canUpgrade = this.equipmentLevel < 3;
      this.actionButton(card, canUpgrade ? `强化全队军备 · ${nextCost}` : '全队军备已满级', -159, -224, 270, 48,
        () => this.upgradeEquipment(), canUpgrade ? new Color(85, 143, 129, 255) : new Color(142, 137, 126, 255), 13);
      this.actionButton(card, `军备进阶 · ${this.equipmentTier}/3`, 159, -224, 270, 48,
        () => this.advanceEquipment(), new Color(205, 91, 86, 255), 14);
    } else if (title === '黑市') {
      this.label(card, 'Market-Intro', `将军信物 ${this.generalFragments}/30 · 虎符 ${this.tigerTalismans}`, 0, 168, 700, 34, 19, new Color(170, 111, 51, 255), true);
      const bench = this.allyRoster.filter(hero => this.lineup.indexOf(hero.id) === -1);
      if (bench.length === 0) {
        this.label(card, 'Market-Empty', '暂时没有待遣散的武将。先在点将台调整上阵阵容。', 0, 56, 670, 40, 18, new Color(119, 92, 72, 255));
      } else {
        bench.slice(0, 3).forEach((hero, index) => {
          const y = 85 - index * 86;
          const row = this.plate(card, `Market-Sell-${hero.id}`, 0, y, 650, 72, new Color(255, 253, 245, 255), 18, new Color(231, 212, 174, 255));
          this.label(row, 'Market-Hero', `${hero.name} · 遣散可得 8 虎符 + 120 铜钱`, -66, 0, 420, 32, 17, PALETTE.ink, true);
          this.actionButton(row, '遣散', 248, 0, 104, 48, () => this.dismissHero(hero.id), new Color(153, 130, 102, 255), 15);
        });
      }
      this.actionButton(card, '30 信物合成名将', -160, -199, 250, 54, () => this.exchangeFragments(), new Color(85, 143, 129, 255), 16);
      this.actionButton(card, '10 虎符换图纸', 160, -199, 250, 54, () => this.exchangeBlueprint(), new Color(205, 91, 86, 255), 16);
    } else if (title === '桃花酒馆') {
      this.label(card, 'Tavern-Copy', '桃花酿香，名将将至', 0, 158, 660, 34, 20, new Color(123, 94, 68, 255));
      const heroes = ['hero-guanyu', 'hero-liubei', 'hero-zhangfei', 'hero-xiaofeng'];
      heroes.forEach((hero, i) => this.sprite(card, `Tavern-Preview-${i}`, hero, -258 + i * 172, 20, 136, 182));
      this.actionButton(card, this.freeRecruit ? '免费招贤' : '招贤一次 · 1800铜钱', 0, -151, 284, 70, () => this.recruit(), new Color(205, 91, 86, 255), 22);
      this.label(card, 'Tavern-Guarantee', '武将可上阵作战，职业之间互相克制', 0, -218, 590, 28, 16, new Color(128, 100, 76, 255));
    } else if (title === '金阙点将台') {
      this.label(card, 'Roster-Subtitle', '被动常驻 · 换技切换两种名将技 · 战士克射手 / 射手克谋士 / 谋士克战士', 0, 176, 730, 38, 14, new Color(123, 94, 68, 255));
      this.allyRoster.forEach((hero, i) => {
        const column = i % 2;
        const rowIndex = Math.floor(i / 2);
        const x = column === 0 ? -198 : 198;
        const y = 70 - rowIndex * 156;
        const row = this.plate(card, `Roster-${hero.id}`, x, y, 370, 150, new Color(255, 253, 245, 255), 20, new Color(231, 212, 174, 255));
        this.sprite(row, 'Roster-Art', hero.art, -135, 4, 98, 126);
        this.label(row, 'Roster-Name', `${hero.name} · ${hero.role}`, 53, 51, 236, 26, 18, PALETTE.ink, true);
        const skillLevel = this.skillLevels[hero.id] ?? 0;
        const gearBonus = this.gearBonuses(hero.id);
        const shownHp = hero.hp + this.equipmentLevel * 18 + (this.equipmentTier - 1) * 30 + gearBonus.hp;
        const shownAttack = hero.attack + this.equipmentLevel * 7 + (this.equipmentTier - 1) * 10 + gearBonus.attack;
        const rosterRange = hero.range + (hero.id === 'huang-zhong' ? 1 : 0);
        const skillChoice = this.selectedSkill(hero.id);
        this.label(row, 'Roster-Stats', `生命 ${shownHp} · 攻击 ${shownAttack}\n移动 ${hero.move} · 射程 ${rosterRange} · 技能 Lv.${skillLevel}`, 53, 17, 238, 37, 12, new Color(119, 92, 72, 255));
        this.label(row, 'Roster-Passive', `${this.passiveName(hero.id)}：${this.passiveDescription(hero.id)}`, 53, -8, 244, 18, 10, new Color(150, 104, 100, 255), true);
        this.label(row, 'Roster-Active-Skill', `名将技「${skillChoice.name}」· ${skillChoice.description}`, 53, -30, 244, 21, 10, new Color(115, 92, 135, 255), true);
        const assigned = this.lineup.indexOf(hero.id) !== -1;
        this.actionButton(row, skillLevel < 5 ? '研习' : '满级', -26, -55, 76, 32, () => this.upgradeSkill(hero.id), new Color(150, 104, 178, 255), 12);
        this.actionButton(row, assigned ? '下阵' : '上阵', 54, -55, 76, 32, () => this.toggleLineup(hero.id), assigned ? new Color(153, 130, 102, 255) : new Color(85, 143, 129, 255), 12);
        this.actionButton(row, '换技', 134, -55, 76, 32, () => this.cycleActiveSkill(hero.id), new Color(85, 143, 129, 255), 12);
      });
    } else if (title === '更多玩法') {
      this.label(card, 'More-Intro', '桃灵为你整理了城池里的其他玩法入口。', 0, 162, 690, 32, 18, new Color(123, 94, 68, 255));
      this.actionButton(card, '活动副本', -224, 52, 210, 68, () => this.showModal('活动副本'), new Color(85, 143, 129, 255), 18);
      this.actionButton(card, '黑市', 0, 52, 210, 68, () => this.showModal('黑市'), new Color(153, 130, 102, 255), 18);
      this.actionButton(card, '征战篇章', 224, 52, 210, 68, () => this.openCampaign(), new Color(205, 91, 86, 255), 18);
      this.label(card, 'More-Tower', `试练塔第 ${this.towerFloor} 层 · 竞技场积分 ${this.arenaPoints}`, 0, -39, 660, 30, 17, new Color(119, 92, 72, 255));
      this.actionButton(card, '返回桃源仙都', 0, -151, 250, 62, () => { this.modal?.destroy(); this.modal = null; }, new Color(88, 95, 95, 230), 17);
    } else {
      const lines = ['玩法筹备中', `当前铜钱 ${this.cityGold} · 修为 ${this.cultivation}`, '回城继续招募与编队，或前往征战获取资源。'];
      lines.forEach((line, index) => this.label(card, `Info-${index}`, line, 0, 110 - index * 62, 680, 40, index === 0 ? 23 : 18, index === 0 ? PALETTE.ink : new Color(121, 94, 72, 255), index === 0));
      this.actionButton(card, '返回桃源仙都', 0, -160, 280, 70, () => { this.modal?.destroy(); this.modal = null; }, new Color(205, 91, 86, 255), 20);
    }
  }

  private toggleLineup(id: string) {
    if (this.lineup.indexOf(id) !== -1) {
      if (this.lineup.length === 1) {
        this.showToast('至少留一位武将上阵。');
        return;
      }
      this.lineup = this.lineup.filter(heroId => heroId !== id);
    } else if (this.lineup.length < 3) {
      this.lineup.push(id);
    } else {
      this.showToast('上阵位置已满，先让一位武将下阵。');
      return;
    }
    this.saveGame();
    this.showModal('金阙点将台');
  }

  private recruit() {
    const candidate = this.recruitPool.find(hero => !this.allyRoster.some(owned => owned.id === hero.id));
    if (!candidate) {
      this.showToast('桃花酒馆暂无新的名将线索。');
      return;
    }
    if (!this.freeRecruit && this.cityGold < 1800) {
      this.showToast('铜钱不足，先去征战获取奖励吧。');
      return;
    }
    this.freeRecruit = false;
    if (candidate.id !== 'zhao-yun') this.cityGold -= 1800;
    this.allyRoster.push(candidate);
    this.saveGame();
    this.showToast(`招贤成功：${candidate.name}加入武将名册！`);
    this.showModal('金阙点将台');
  }

  private enterEvent(name: string) {
    const remaining = this.eventAttempts[name] ?? 0;
    if (remaining <= 0) {
      this.showToast('今天的挑战次数已经用完，明天再来吧。');
      return;
    }
    this.eventAttempts[name] = remaining - 1;
    this.saveGame();
    const suffix = name === '营救献帝' ? '· 护送车驾' : name === '云游隆中' ? '· 搜集兵书' : '· 名将挑战';
    this.startBattle(`${name} ${suffix}`, -1, 'event', name);
  }

  private upgradeEquipment() {
    if (this.equipmentLevel >= 3) {
      this.showToast('套装强化等级不能超过城池等级。');
      return;
    }
    const cost = (this.equipmentLevel + 1) * 250;
    if (this.cityGold < cost) {
      this.showToast(`铜钱不足，还需要 ${cost - this.cityGold}。`);
      return;
    }
    this.cityGold -= cost;
    this.equipmentLevel += 1;
    this.saveGame();
    this.showModal('云集商铺');
    this.showToast(`套装已强化至 +${this.equipmentLevel}。`);
  }

  private craftGear(heroId: string, slot: EquipmentSlot) {
    const hero = this.allyRoster.find(item => item.id === heroId);
    if (!hero) return;
    const baseCost = slot === '武器' ? 420 : slot === '护甲' ? 380 : 350;
    const cost = baseCost * this.equipmentTier;
    if (this.cityGold < cost) {
      this.showToast(`铜钱不足，打造${slot}还需要 ${cost - this.cityGold}。`);
      return;
    }
    this.cityGold -= cost;
    const tier = this.equipmentTier;
    const item: GearData = {
      id: `gear-${++this.gearSerial}`,
      name: `${hero.name}·${slot === '武器' ? '青锋' : slot === '护甲' ? '流云甲' : '护心佩'}`,
      slot,
      tier,
      level: 0,
      attack: slot === '武器' ? 18 + (tier - 1) * 9 : slot === '饰品' ? 8 + (tier - 1) * 5 : 0,
      hp: slot === '护甲' ? 110 + (tier - 1) * 50 : slot === '饰品' ? 55 + (tier - 1) * 25 : 0,
    };
    this.gearInventory.push(item);
    if (!this.equippedGear[heroId]) this.equippedGear[heroId] = {};
    this.equippedGear[heroId]![slot] = item.id;
    this.saveGame();
    this.showModal('云集商铺');
    this.showToast(`${item.name}打造完成，已为${hero.name}穿戴。`);
  }

  private cycleGear(heroId: string, slot: EquipmentSlot) {
    const available = this.gearInventory.filter(item => item.slot === slot && !this.isGearEquipped(item.id));
    if (available.length === 0) {
      this.showToast(`背包里没有未穿戴的${slot}，可以先打造一件。`);
      return;
    }
    if (!this.equippedGear[heroId]) this.equippedGear[heroId] = {};
    this.equippedGear[heroId]![slot] = available[0].id;
    this.saveGame();
    this.showModal('云集商铺');
    this.showToast(`已为${this.allyRoster.find(hero => hero.id === heroId)?.name ?? '武将'}更换${slot}。`);
  }

  private upgradeGear(heroId: string, slot: EquipmentSlot) {
    const item = this.gearFor(heroId, slot);
    if (!item) {
      this.showToast(`先为这位武将装备${slot}。`);
      return;
    }
    if (item.level >= 3) {
      this.showToast('这件装备已经强化到当前上限。');
      return;
    }
    const cost = 120 * (item.level + 1) * item.tier;
    if (this.cityGold < cost) {
      this.showToast(`铜钱不足，还需要 ${cost - this.cityGold}。`);
      return;
    }
    this.cityGold -= cost;
    item.level += 1;
    this.saveGame();
    this.showModal('云集商铺');
    this.showToast(`${item.name}强化至 +${item.level}。`);
  }

  private advanceEquipment() {
    if (this.equipmentBlueprints < 1) {
      this.showToast('还没有进阶图纸，先去征战关卡收集。');
      return;
    }
    if (this.equipmentTier >= 3) {
      this.showToast('套装已达到当前最高阶。');
      return;
    }
    this.equipmentBlueprints -= 1;
    this.equipmentTier += 1;
    this.equipmentLevel = 0;
    this.saveGame();
    this.showModal('云集商铺');
    this.showToast(`套装进阶至第 ${this.equipmentTier} 阶，强化等级已重置。`);
  }

  private dismissHero(id: string) {
    if (this.lineup.indexOf(id) !== -1 || this.lineup.length <= 1) {
      this.showToast('上阵武将不能遣散，请先调整阵容。');
      return;
    }
    const hero = this.allyRoster.find(item => item.id === id);
    if (!hero) return;
    this.allyRoster = this.allyRoster.filter(item => item.id !== id);
    delete this.equippedGear[id];
    this.tigerTalismans += 8;
    this.cityGold += 120;
    this.saveGame();
    this.showModal('黑市');
    this.showToast(`${hero.name}已遣散，获得 8 虎符和 120 铜钱。`);
  }

  private exchangeFragments() {
    if (this.generalFragments < 30) {
      this.showToast(`信物不足，还差 ${30 - this.generalFragments} 个。`);
      return;
    }
    const candidate = this.recruitPool.find(hero => !this.allyRoster.some(owned => owned.id === hero.id));
    if (!candidate) {
      this.showToast('暂时没有可合成的新名将。');
      return;
    }
    this.generalFragments -= 30;
    this.allyRoster.push(candidate);
    this.saveGame();
    this.showModal('金阙点将台');
    this.showToast(`${candidate.name}已由信物合成，加入名册！`);
  }

  private exchangeBlueprint() {
    if (this.tigerTalismans < 10) {
      this.showToast(`虎符不足，还差 ${10 - this.tigerTalismans} 枚。`);
      return;
    }
    this.tigerTalismans -= 10;
    this.equipmentBlueprints += 1;
    this.saveGame();
    this.showModal('黑市');
    this.showToast('兑换成功：获得一张装备进阶图纸。');
  }

  private upgradeSkill(heroId: string) {
    const level = this.skillLevels[heroId] ?? 0;
    if (level >= 5) {
      this.showToast('这位武将的名将技已经满级。');
      return;
    }
    const cost = 20 * (level + 1);
    if (this.cultivation < cost) {
      this.showToast(`修为不足，还需要 ${cost - this.cultivation} 点。`);
      return;
    }
    this.cultivation -= cost;
    this.skillLevels[heroId] = level + 1;
    this.saveGame();
    const hero = this.allyRoster.find(item => item.id === heroId);
    this.showModal('金阙点将台');
    this.showToast(`${hero?.name ?? '武将'}的名将技提升至 Lv.${level + 1}。`);
  }

  private redeemArenaItem(item: 'fragments' | 'cultivation') {
    const cost = item === 'fragments' ? 30 : 20;
    if (this.arenaPoints < cost) {
      this.showToast(`竞技积分不足，还需要 ${cost - this.arenaPoints} 分。`);
      return;
    }
    this.arenaPoints -= cost;
    if (item === 'fragments') this.generalFragments += 5;
    else this.cultivation += 20;
    this.saveGame();
    this.showModal('竞技场');
    this.showToast(item === 'fragments' ? '获得 5 个名将信物。' : '获得 20 点修为。');
  }

  private showToast(text: string) {
    if (!this.canvasNode) return;
    const toast = this.plate(this.canvasNode, 'Toast', 0, -this.screenH / 2 + 215, 650, 64, new Color(43, 49, 50, 231), 20);
    const label = this.label(toast, 'Toast-Text', text, 0, 0, 620, 54, 18, PALETTE.cream, true);
    const opacity = toast.addComponent(UIOpacity);
    tween(opacity).delay(1.25).to(0.35, { opacity: 0 }).call(() => toast.destroy()).start();
    void label;
  }

  private startBattle(stageName = '长坂坡 · 黄巾来袭', campaignStage = -1, mode: BattleMode = 'story', eventName = '') {
    if (!this.canvasNode) return;
    this.page = 'battle';
    this.stageName = stageName;
    this.campaignStage = campaignStage;
    this.battleMode = mode;
    this.battleEvent = eventName;
    this.eventObjective = eventName === '营救献帝' ? 'escort' : eventName === '云游隆中' ? 'collect' : 'defeat';
    this.scrollCells = this.eventObjective === 'collect' ? ['3,3', '4,0', '6,3'] : [];
    this.collectedScrolls = 0;
    this.turn = 1;
    this.phase = 'player';
    this.activeSkill = false;
    this.autoMode = false;
    this.selectedId = 'guan-yu';
    this.guideLine = this.eventObjective === 'escort'
      ? '献帝车驾每回合向前行进一格。守住道路，让车驾安全抵达右侧终点！'
      : this.eventObjective === 'collect'
        ? '兵书在金色光点中。移动武将踏入光点即可拾取，集齐三卷便可撤离。'
        : '点选一名友军，绿色格可移动；攻击范围内的敌人会以红色高亮。';
    this.boardWidth = Math.min(1624, this.screenW * 0.845);
    this.boardHeight = Math.min(608, this.screenH * 0.563);
    this.boardTop = this.boardHeight / 2 - 14;
    const party = this.lineup
      .map(id => this.allyRoster.find(hero => hero.id === id))
      .filter((hero): hero is typeof this.allyRoster[number] => !!hero)
      .slice(0, 3);
    const frontlineRows = [1, 2, 0, 3];
    const backlineRows = [1, 2, 0, 3];
    let frontlineCount = 0;
    let backlineCount = 0;
    const startingCells: Array<[number, number]> = party.map(hero => {
      if (hero.role === '战士') {
        const index = frontlineCount++;
        return [2, frontlineRows[index % frontlineRows.length]];
      }
      const index = backlineCount++;
      return [0, backlineRows[index % backlineRows.length]];
    });
    const allies: UnitData[] = party.map((hero, index) => {
      const gearBonus = this.gearBonuses(hero.id);
      const hp = hero.hp + this.equipmentLevel * 18 + (this.equipmentTier - 1) * 30 + gearBonus.hp;
      const attack = hero.attack + this.equipmentLevel * 7 + (this.equipmentTier - 1) * 10 + gearBonus.attack;
      return {
        ...hero,
        range: hero.range + (hero.id === 'huang-zhong' ? 1 : 0),
        hp,
        attack,
        team: 'ally', col: startingCells[index][0], row: startingCells[index][1],
        maxHp: hp,
        moved: false, acted: false, alive: true,
        stunnedTurns: 0, counterReady: false,
      };
    });
    this.selectedId = allies[0]?.id ?? 'guan-yu';
    const storyFoes = [
      { id: 'soldier', name: '黄巾刀卒', role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 1, hp: 500, attack: 82, move: 2, range: 1 },
      { id: 'archer', name: '黄巾弓手', role: '射手' as Role, art: 'hero-xiaofeng', col: 6, row: 2, hp: 370, attack: 74, move: 2, range: 3 },
      { id: 'strategist', name: '黄巾军师', role: '谋士' as Role, art: 'hero-liubei', col: 7, row: 1, hp: 340, attack: 88, move: 2, range: 3 },
    ];
    if (this.campaignStage === 1) {
      storyFoes[0].name = '西凉刀兵';
      storyFoes[1].name = '飞熊弓手';
      storyFoes[2].name = '虎牢谋士';
    } else if (this.campaignStage === 2) {
      storyFoes[0].name = '曹军追兵';
      storyFoes[1].name = '曹营弓手';
      storyFoes[2].name = '曹营军师';
    }
    const arenaFoes = [
      { id: 'duelist', name: '演武先锋', role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 1, hp: 430, attack: 76, move: 3, range: 1 },
      { id: 'marksman', name: '演武神射', role: '射手' as Role, art: 'hero-xiaofeng', col: 6, row: 2, hp: 360, attack: 70, move: 2, range: 3 },
      { id: 'tactician', name: '演武军师', role: '谋士' as Role, art: 'hero-liubei', col: 7, row: 1, hp: 390, attack: 80, move: 2, range: 3 },
    ];
    const towerFoes = [
      { id: 'guardian', name: `守塔刀卫 · ${this.towerFloor}`, role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 1, hp: 490, attack: 80, move: 2, range: 1 },
      { id: 'sentinel', name: '凌云弓卫', role: '射手' as Role, art: 'hero-xiaofeng', col: 6, row: 2, hp: 360, attack: 72, move: 2, range: 3 },
      { id: 'seer', name: '观星守将', role: '谋士' as Role, art: 'hero-liubei', col: 7, row: 1, hp: 350, attack: 84, move: 2, range: 3 },
    ];
    const eventFoes = eventName === '名将列传' ? [
      { id: 'biography-boss', name: '列传守将·华雄', role: '战士' as Role, art: 'hero-zhangfei', col: 6, row: 1, hp: 720, attack: 104, move: 2, range: 1 },
      { id: 'biography-guard', name: '西凉刀卫', role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 2, hp: 430, attack: 76, move: 2, range: 1 },
      { id: 'biography-archer', name: '军中弩手', role: '射手' as Role, art: 'hero-xiaofeng', col: 7, row: 3, hp: 350, attack: 72, move: 2, range: 3 },
    ] : eventName === '营救献帝' ? [
      { id: 'escort-raider', name: '飞熊追兵', role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 1, hp: 450, attack: 80, move: 2, range: 1 },
      { id: 'escort-bow', name: '追击弓手', role: '射手' as Role, art: 'hero-xiaofeng', col: 6, row: 2, hp: 370, attack: 72, move: 2, range: 3 },
      { id: 'escort-captain', name: '董军校尉', role: '谋士' as Role, art: 'hero-liubei', col: 7, row: 1, hp: 400, attack: 82, move: 2, range: 3 },
    ] : [
      { id: 'scroll-bandit', name: '山径伏兵', role: '战士' as Role, art: 'hero-tuantuan', col: 5, row: 1, hp: 420, attack: 74, move: 2, range: 1 },
      { id: 'scroll-ranger', name: '林间弓手', role: '射手' as Role, art: 'hero-xiaofeng', col: 6, row: 2, hp: 390, attack: 76, move: 2, range: 3 },
      { id: 'scroll-mystic', name: '迷阵方士', role: '谋士' as Role, art: 'hero-liubei', col: 7, row: 1, hp: 360, attack: 88, move: 2, range: 3 },
    ];
    const baseFoes = this.battleMode === 'arena' ? arenaFoes : this.battleMode === 'tower' ? towerFoes : this.battleMode === 'event' ? eventFoes : storyFoes;
    const enemyScale = this.battleMode === 'tower' ? 1 + Math.min(10, this.towerFloor - 1) * 0.055 : 1;
    const enemies: UnitData[] = baseFoes.map(foe => ({
      id: `${this.battleMode}-${foe.id}`,
      name: foe.name,
      role: foe.role,
      art: foe.art,
      team: 'enemy',
      col: foe.col,
      row: foe.row,
      hp: Math.floor(foe.hp * enemyScale),
      maxHp: Math.floor(foe.hp * enemyScale),
      attack: Math.floor(foe.attack * enemyScale),
      move: foe.move,
      range: foe.range,
      moved: false,
      acted: false,
      alive: true,
      stunnedTurns: 0,
      counterReady: false,
    }));
    const escort = this.eventObjective === 'escort' ? {
      id: this.escortUnitId,
      name: '献帝车驾',
      role: '谋士' as Role,
      art: 'hero-taoyao',
      team: 'objective' as const,
      col: 0,
      row: 3,
      hp: 760,
      maxHp: 760,
      attack: 0,
      move: 1,
      range: 0,
      moved: false,
      acted: true,
      alive: true,
      stunnedTurns: 0,
      counterReady: false,
    } : null;
    this.units = escort ? [...allies, escort, ...enemies] : [...allies, ...enemies];
    const mainSkill = this.resolveMainSkill();
    if (mainSkill) this.guideLine = `阵容羁绊「${mainSkill.name}」已就绪，开场自动发动。`;
    this.renderBattle();
    if (mainSkill) this.scheduleOnce(() => this.fireMainSkill(mainSkill), 0.45);
  }

  private resolveMainSkill() {
    const rosterIds = this.lineup;
    const peachGarden = ['liu-bei', 'guan-yu', 'zhang-fei'];
    if (peachGarden.every(id => rosterIds.indexOf(id) !== -1)) {
      return { name: '桃园同心', heroIds: peachGarden, multiplier: 0.6, targetCount: 3 };
    }
    const dragonPair = ['guan-yu', 'zhao-yun'];
    if (dragonPair.every(id => rosterIds.indexOf(id) !== -1)) {
      return { name: '龙胆青锋', heroIds: dragonPair, multiplier: 0.8, targetCount: 2 };
    }
    return null;
  }

  private fireMainSkill(skill: { name: string; heroIds: string[]; multiplier: number; targetCount: number }) {
    if (this.page !== 'battle' || this.phase !== 'player') return;
    const sources = this.units.filter(unit => unit.team === 'ally' && unit.alive && skill.heroIds.indexOf(unit.id) !== -1);
    const enemies = this.units.filter(unit => unit.team === 'enemy' && unit.alive);
    if (sources.length === 0 || enemies.length === 0) return;
    const totalAttack = sources.reduce((sum, unit) => sum + unit.attack, 0);
    const damage = Math.floor(totalAttack * skill.multiplier);
    const targets = enemies.slice().sort(() => Math.random() - 0.5).slice(0, skill.targetCount);
    targets.forEach((target, index) => {
      const actualDamage = this.applyDamage(target, damage);
      this.animateHit(sources[index % sources.length], target, actualDamage, true);
    });
    this.guideLine = `主将技「${skill.name}」发动！合击命中 ${targets.length} 名敌人。`;
    this.refreshGuide();
    this.drawCells();
    this.scheduleOnce(() => {
      targets.filter(target => !target.alive).forEach(target => this.unitViews.get(target.id)?.destroy());
      this.checkBattleResult();
    }, 0.68);
  }

  private renderBattle(startPositions?: Map<string, Vec3>) {
    if (!this.canvasNode) return;
    this.page = 'battle';
    this.clearCanvas();
    this.background(this.frames['battle-grid-cute'] ? 'battle-grid-cute' : 'battle-grid');

    const edge = this.screenW / 2;
    this.plate(this.canvasNode, 'Battle-Header', 0, this.screenH / 2 - 64, this.screenW - 60, 96, new Color(34, 40, 43, 221), 24, new Color(255, 238, 198, 100));
    this.actionButton(this.canvasNode, '‹  返回城池', -edge + 176, this.screenH / 2 - 64, 248, 58, () => this.renderCity(), new Color(88, 95, 95, 230), 19);
    this.label(this.canvasNode, 'Battle-Title', this.stageName, 0, this.screenH / 2 - 48, 460, 40, 27, PALETTE.cream, true);
    this.turnLabel = this.label(this.canvasNode, 'Turn-Info', `第 ${this.turn} 回合 · 我方行动`, edge - 350, this.screenH / 2 - 62, 300, 48, 18, PALETTE.gold, true);
    this.plate(this.canvasNode, 'Objective-Pill', 0, this.screenH / 2 - 117, 690, 42, new Color(50, 53, 55, 218), 20, new Color(255, 231, 184, 96));
    this.objectiveLabel = this.label(this.canvasNode, 'Objective-Text', this.battleObjectiveText(), 0, this.screenH / 2 - 117, 660, 36, 16, PALETTE.cream, true);

    const cellH = this.boardHeight / 4;
    const gridY = -14;
    this.cellNodes = Array.from({ length: 4 }, () => []);
    for (let row = 0; row < 4; row += 1) {
      const rowWidth = this.boardWidth * (0.795 + row * 0.0683333);
      const cellW = rowWidth / 8;
      const gridLeft = -rowWidth / 2;
      this.cellNodes[row] = [];
      for (let col = 0; col < 8; col += 1) {
        const x = gridLeft + cellW * (col + 0.5);
        const y = gridY + this.boardHeight / 2 - cellH * (row + 0.5);
        const cell = this.child(this.canvasNode, `Cell-${col}-${row}`, x, y, cellW - 2, cellH - 2);
        cell.on(Node.EventType.TOUCH_END, () => this.onCellTap(col, row), this);
        this.cellNodes[row][col] = cell;
      }
    }

    this.drawCells();
    const sorted = [...this.units].filter(unit => unit.alive).sort((a, b) => a.row - b.row);
    for (const unit of sorted) this.createUnitView(unit, startPositions?.get(unit.id));

    this.plate(this.canvasNode, 'Action-Deck', 0, -this.screenH / 2 + 108, this.screenW - 60, 174, new Color(255, 247, 229, 244), 28, new Color(255, 255, 248, 255));
    this.plate(this.canvasNode, 'Portrait-Card', -edge + 167, -this.screenH / 2 + 110, 244, 138, new Color(255, 252, 241, 255), 21, new Color(239, 217, 179, 255));
    this.sprite(this.canvasNode, 'Guide-Icon', 'hero-taoyao', -edge + 95, -this.screenH / 2 + 107, 106, 128, 2);
    this.label(this.canvasNode, 'Guide-Name', '桃灵 · 战场指引', -edge + 258, -this.screenH / 2 + 143, 148, 25, 14, new Color(190, 93, 92, 255), true);
    this.guideLabel = this.label(this.canvasNode, 'Guide-Text', this.guideLine, -edge + 265, -this.screenH / 2 + 103, 168, 58, 13, new Color(103, 79, 62, 255));

    this.selectedCard = this.plate(this.canvasNode, 'Selected-Card', -88, -this.screenH / 2 + 111, 610, 132, new Color(255, 253, 246, 248), 21, new Color(239, 217, 179, 255));
    this.refreshSelectedCard();
    const buttonX = edge - 390;
    const skillButton = this.actionButton(this.canvasNode, '名将技-选择目标', buttonX, -this.screenH / 2 + 143, 260, 56, () => this.toggleSkill(), new Color(150, 104, 178, 255), 17);
    const skillTitle = skillButton.getChildByName('Title')?.getComponent(Label);
    if (skillTitle) skillTitle.string = this.skillButtonText();
    this.actionButton(this.canvasNode, this.autoMode ? '自动战斗 · 开' : '自动战斗 · 关', buttonX, -this.screenH / 2 + 82, 164, 49, () => this.toggleAuto(), new Color(82, 146, 129, 255), 14);
    this.actionButton(this.canvasNode, '结束回合', buttonX + 190, -this.screenH / 2 + 82, 164, 49, () => this.endPlayerTurn(), new Color(205, 91, 86, 255), 16);
    this.updateHud();
  }

  private refreshSelectedCard() {
    const card = this.selectedCard;
    if (!card) return;
    for (const child of [...card.children]) child.destroy();
    const selected = this.units.find(unit => unit.id === this.selectedId && unit.alive);
    if (!selected) return;
    this.sprite(card, 'Selected-Hero', selected.art, -225, 4, 106, 124, 1);
    this.label(card, 'Selected-Name', `${selected.name} · ${selected.role}`, 12, 36, 240, 28, 19, PALETTE.ink, true);
    this.label(card, 'Selected-Stats', `生命 ${selected.hp}/${selected.maxHp}   攻击 ${selected.attack}   移动 ${selected.move}   射程 ${selected.range}`, 20, -2, 326, 26, 14, new Color(119, 92, 72, 255));
    const statusText = selected.stunnedTurns > 0 ? '眩晕中' : selected.counterReady ? '龙胆蓄势 · 下次攻击 +40%' : `${this.passiveName(selected.id)} · ${this.passiveDescription(selected.id)}`;
    this.label(card, 'Selected-Passive', statusText, 20, -27, 350, 24, 12, selected.stunnedTurns > 0 ? PALETTE.coral : new Color(150, 104, 100, 255), true);
    this.label(card, 'Selected-Order', selected.acted ? '本回合行动完成' : selected.moved ? '已移动 · 仍可行动' : '可移动后攻击，也可先发动名将技', 10, -51, 310, 20, 12, selected.acted ? PALETTE.coral : new Color(91, 145, 115, 255));
  }

  private drawCells() {
    const selected = this.units.find(unit => unit.id === this.selectedId && unit.alive && unit.team === 'ally');
    const reachable = selected && !selected.moved && !selected.acted ? this.reachableCells(selected) : new Set<string>();
    const cellH = this.boardHeight / 4;
    for (let row = 0; row < 4; row += 1) {
      const cellW = this.boardWidth * (0.795 + row * 0.0683333) / 8;
      for (let col = 0; col < 8; col += 1) {
        const cell = this.cellNodes[row]?.[col];
        if (!cell) continue;
        const graphic = cell.getComponent(Graphics) ?? cell.addComponent(Graphics);
        graphic.clear();
        const target = this.units.find(unit => unit.alive && unit.col === col && unit.row === row);
        let tint = new Color(255, 244, 212, 16);
        let border = new Color(255, 235, 190, 42);
        if (selected && selected.id !== target?.id) {
          const distance = this.distance(selected.col, selected.row, col, row);
          if (!target && reachable.has(`${col},${row}`)) {
            tint = PALETTE.paleJade;
            border = new Color(128, 255, 197, 215);
          } else if (target?.team === 'enemy' && distance <= selected.range) {
            tint = PALETTE.paleRed;
            border = new Color(255, 170, 128, 225);
          }
        }
        if (this.scrollCells.indexOf(`${col},${row}`) !== -1) {
          tint = new Color(255, 205, 88, 86);
          border = new Color(255, 224, 129, 245);
        }
        if (target?.team === 'objective') {
          tint = new Color(255, 222, 143, 92);
          border = new Color(255, 234, 167, 255);
        }
        if (selected?.col === col && selected?.row === row) {
          tint = PALETTE.paleGold;
          border = new Color(255, 221, 117, 255);
        }
        graphic.fillColor = tint;
        graphic.roundRect(-cellW / 2 + 3, -cellH / 2 + 3, cellW - 6, cellH - 6, 10);
        graphic.fill();
        graphic.lineWidth = 2;
        graphic.strokeColor = border;
        graphic.roundRect(-cellW / 2 + 3, -cellH / 2 + 3, cellW - 6, cellH - 6, 10);
        graphic.stroke();
      }
    }
  }

  private createUnitView(unit: UnitData, start?: Vec3) {
    if (!this.canvasNode) return;
    const [x, y] = this.cellPosition(unit.col, unit.row);
    const depthScale = 0.80 + unit.row * 0.065;
    const root = this.child(this.canvasNode, `Unit-${unit.id}`, start?.x ?? x, start?.y ?? y - 2, 172, 285, unit.row);
    this.unitViews.set(unit.id, root);
    const shadow = root.addComponent(Graphics);
    shadow.fillColor = new Color(22, 16, 14, 148);
    shadow.ellipse(0, -106, 64 * depthScale, 14 * depthScale);
    shadow.fill();
    const art = this.sprite(root, `Art-${unit.id}`, unit.art, 0, 28, 170 * depthScale, 242 * depthScale, 1);
    const bob = unit.team === 'ally' ? 1.8 : -1.8;
    tween(art).repeatForever(tween().to(1.25 + Math.random() * 0.2, { position: new Vec3(0, 28 + bob, 0) }).to(1.25, { position: new Vec3(0, 28, 0) })).start();
    const tagColor = unit.team === 'ally' ? new Color(43, 92, 154, 238) : unit.team === 'objective' ? new Color(177, 128, 48, 245) : new Color(170, 65, 68, 238);
    this.plate(root, 'Name-Tag', 0, -106, 132 * depthScale, 31, tagColor, 10, new Color(255, 246, 224, 140));
    this.label(root, 'Name', unit.name, 0, -106, 122 * depthScale, 28, 14 * depthScale, PALETTE.cream, true);
    const bar = this.child(root, 'Health-Track', 0, -129, 100 * depthScale, 9, 3);
    const bg = bar.addComponent(Graphics);
    bg.fillColor = new Color(47, 37, 32, 220);
    bg.roundRect(-50 * depthScale, -4, 100 * depthScale, 8, 4);
    bg.fill();
    const fill = this.child(root, 'Health-Fill', -50 * depthScale + (unit.hp / unit.maxHp) * 50 * depthScale, 0, Math.max(2, 100 * depthScale * unit.hp / unit.maxHp), 6, 1);
    const hpGraphic = fill.addComponent(Graphics);
    hpGraphic.fillColor = unit.hp / unit.maxHp > 0.35 ? new Color(102, 202, 123, 255) : new Color(239, 113, 93, 255);
    hpGraphic.roundRect(-fill.getComponent(UITransform)!.width / 2, -3, fill.getComponent(UITransform)!.width, 6, 3);
    hpGraphic.fill();
    this.unitHealth.set(unit.id, fill);
    root.on(Node.EventType.TOUCH_END, () => this.onUnitTap(unit.id), this);
    if (unit.id === this.selectedId && unit.team === 'ally') {
      this.plate(root, 'Active-Ring', 0, -129, 152, 18, new Color(255, 213, 93, 150), 9);
    }
    this.syncUnitStatusView(unit);
    if (start) tween(root).to(0.32, { position: new Vec3(x, y - 2, 0) }, { easing: 'backOut' }).start();
  }

  private updateHealth(unit: UnitData) {
    const fill = this.unitHealth.get(unit.id);
    if (!fill) return;
    const width = 100 * (0.80 + unit.row * 0.065) * Math.max(0.02, unit.hp / unit.maxHp);
    const ui = fill.getComponent(UITransform);
    const graphic = fill.getComponent(Graphics);
    if (!ui || !graphic) return;
    ui.setContentSize(width, 6);
    fill.setPosition(-50 * (0.80 + unit.row * 0.065) + width / 2, 0, 1);
    graphic.clear();
    graphic.fillColor = unit.hp / unit.maxHp > 0.35 ? new Color(102, 202, 123, 255) : new Color(239, 113, 93, 255);
    graphic.roundRect(-width / 2, -3, width, 6, 3);
    graphic.fill();
  }

  private syncUnitStatusView(unit: UnitData) {
    const root = this.unitViews.get(unit.id);
    if (!root) return;
    const status = root.getChildByName('Status-Tag');
    if (unit.stunnedTurns > 0) {
      if (!status) {
        const tag = this.plate(root, 'Status-Tag', 54, -80, 84, 28, new Color(110, 76, 145, 240), 12, new Color(244, 225, 255, 255));
        this.label(tag, 'Status-Text', '眩晕', 0, 0, 74, 25, 13, PALETTE.cream, true);
      }
    } else if (status) {
      status.destroy();
    }
    const charged = root.getChildByName('Charge-Tag');
    if (unit.counterReady) {
      if (!charged) {
        const tag = this.plate(root, 'Charge-Tag', -54, -80, 92, 28, new Color(54, 120, 166, 240), 12, new Color(211, 244, 255, 255));
        this.label(tag, 'Charge-Text', '龙胆蓄势', 0, 0, 84, 25, 11, PALETTE.cream, true);
      }
    } else if (charged) {
      charged.destroy();
    }
  }

  private onUnitTap(id: string) {
    const unit = this.units.find(item => item.id === id && item.alive);
    if (!unit || this.phase !== 'player') return;
    if (unit.team === 'objective') {
      this.guideLine = '保護献帝车驾！它会在每轮我方行动结束后继续前进。';
      this.refreshGuide();
      return;
    }
    if (unit.team === 'ally') {
      this.selectedId = id;
      this.activeSkill = false;
      this.guideLine = unit.acted ? '這位武將已完成本回合行動，還可切換其他隊友。' : '已選中。綠色格可移動，紅色格內的敵人可被攻擊。';
      this.refreshBattleSelection();
      return;
    }
    this.attackSelected(unit);
  }

  private onCellTap(col: number, row: number) {
    if (this.phase !== 'player') return;
    const occupant = this.units.find(unit => unit.alive && unit.col === col && unit.row === row);
    if (occupant) {
      this.onUnitTap(occupant.id);
      return;
    }
    const selected = this.units.find(unit => unit.id === this.selectedId && unit.alive && unit.team === 'ally');
    if (!selected || selected.moved || selected.acted) return;
    if (!this.reachableCells(selected).has(`${col},${row}`)) {
      this.guideLine = '请点亮绿色棋格移动；友军和敌军会挡住行进路线。';
      this.refreshGuide();
      return;
    }
    const old = this.cellPosition(selected.col, selected.row);
    selected.col = col;
    selected.row = row;
    selected.moved = true;
    const foundScroll = this.collectScrollAtCell(col, row);
    if (!foundScroll) this.guideLine = '站位已调整！现在可以点红色范围内的敌军，或释放名将技。';
    this.drawCells();
    const actor = this.unitViews.get(selected.id);
    if (actor) {
      actor.setPosition(old[0], old[1] - 2, 0);
      tween(actor).to(0.3, { position: new Vec3(this.cellPosition(col, row)[0], this.cellPosition(col, row)[1] - 2, 0) }, { easing: 'backOut' }).start();
    }
    this.refreshBattleSelection();
    if (this.eventObjective === 'collect' && this.collectedScrolls >= 3) {
      this.scheduleOnce(() => this.checkBattleResult(), 0.34);
    }
    if (this.autoMode) this.scheduleOnce(() => this.runAutoPlayerStep(0), 0.45);
  }

  private collectScrollAtCell(col: number, row: number) {
    const key = `${col},${row}`;
    if (this.scrollCells.indexOf(key) === -1) return false;
    this.scrollCells = this.scrollCells.filter(scroll => scroll !== key);
    this.collectedScrolls += 1;
    this.guideLine = `拾得一卷兵书！已收集 ${this.collectedScrolls}/3。`;
    this.refreshObjectiveHud();
    return true;
  }

  private attackSelected(target: UnitData) {
    if (target.team !== 'enemy') return;
    const attacker = this.units.find(unit => unit.id === this.selectedId && unit.alive && unit.team === 'ally');
    if (!attacker || this.phase !== 'player' || attacker.acted) return;
    const distance = this.distance(attacker.col, attacker.row, target.col, target.row);
    if (distance > attacker.range) {
      this.guideLine = '敌人超出射程。先选择绿色棋格移动，让队伍站进红色攻击范围。';
      this.refreshGuide();
      return;
    }
    const skill = this.activeSkill;
    const skillChoice = this.selectedSkill(attacker.id);
    if (skill && skillChoice.id === 'benevolence') {
      this.castBenevolence(attacker);
      return;
    }
    const skillLevel = this.skillLevels[attacker.id] ?? 0;
    const dashCell = skill && skillChoice.id === 'seven-advances' ? this.sevenAdvancesCell(attacker, target) : null;
    const nearbyTargets = skill && skillChoice.id === 'thunder-sweep'
      ? this.units.filter(unit => unit.team === 'enemy' && unit.alive && unit.id !== target.id && this.distance(target.col, target.row, unit.col, unit.row) <= 1)
      : [];
    attacker.acted = true;
    attacker.moved = true;
    attacker.counterReady = false;
    this.refreshSelectedCard();
    let actualDamage = 0;
    const tripleShotDamages: number[] = [];
    const splashResults: Array<{ unit: UnitData; damage: number }> = [];
    if (skillChoice.id === 'triple-volley' && skill) {
      for (let shot = 0; shot < 3 && target.alive; shot += 1) {
        const shotDamage = this.attackDamage(attacker, target, this.skillMultiplier(skillChoice.id, skillLevel));
        const dealt = this.applyDamage(target, shotDamage);
        tripleShotDamages.push(dealt);
        actualDamage += dealt;
      }
    } else {
      const multiplier = skill ? this.skillMultiplier(skillChoice.id, skillLevel) : 1;
      actualDamage = this.applyDamage(target, this.attackDamage(attacker, target, multiplier));
    }
    nearbyTargets.forEach(nearby => {
      if (!nearby.alive) return;
      const splashDamage = this.attackDamage(attacker, nearby, 0.72 + skillLevel * 0.04);
      const dealt = this.applyDamage(nearby, splashDamage);
      actualDamage += dealt;
      splashResults.push({ unit: nearby, damage: dealt });
    });
    if (skill && attacker.id === 'zhang-fei') {
      [target, ...nearbyTargets].filter(unit => unit.alive).forEach(unit => {
        unit.stunnedTurns = Math.max(unit.stunnedTurns, 1);
        this.syncUnitStatusView(unit);
      });
    }
    this.activeSkill = false;
    const effectText = skill && attacker.id === 'zhang-fei'
      ? '并击晕命中的敌军！'
      : skillChoice.id === 'seven-advances' && dashCell
        ? '随后闪身突进！'
        : skillChoice.id === 'triple-volley'
          ? `三连射命中 ${tripleShotDamages.length} 次！`
          : skillChoice.id === 'thunder-sweep' && nearbyTargets.length > 0
            ? `横扫波及 ${nearbyTargets.length} 名邻近敌军！`
            : '';
    this.guideLine = skill ? `${attacker.name}发动「${skillChoice.name}」，${effectText}合计造成 ${actualDamage} 点伤害。` : `${attacker.name}出击，造成 ${actualDamage} 点伤害！`;
    if (skillChoice.id === 'triple-volley' && skill) {
      tripleShotDamages.forEach((damage, index) => this.scheduleOnce(() => this.animateHit(attacker, target, damage, true), index * 0.11));
    } else {
      this.animateHit(attacker, target, actualDamage - splashResults.reduce((sum, item) => sum + item.damage, 0), skill);
    }
    splashResults.forEach((result, index) => this.scheduleOnce(() => this.animateHit(attacker, result.unit, result.damage, true), 0.12 + index * 0.1));
    this.drawCells();
    this.updateHud();
    this.refreshGuide();
    if (dashCell) this.scheduleOnce(() => this.resolveSevenAdvances(attacker, dashCell), 0.3);
    this.scheduleOnce(() => {
      [target, ...nearbyTargets].filter(unit => !unit.alive).forEach(unit => this.unitViews.get(unit.id)?.destroy());
      this.checkBattleResult();
      if (this.autoMode && this.phase === 'player') this.scheduleOnce(() => this.runAutoPlayerStep(0), 0.25);
    }, 0.62);
  }

  private skillMultiplier(skillId: string, level: number) {
    const bonus = level * 0.08;
    switch (skillId) {
      case 'double-swords': return 1.65 + bonus;
      case 'green-dragon': return 1.7 + bonus;
      case 'moon-cleaver': return 2.05 + bonus;
      case 'yanren-charge': return 1.6 + bonus;
      case 'thunder-sweep': return 0.95 + bonus * 0.5;
      case 'dragon-thrust': return 1.7 + bonus;
      case 'seven-advances': return 1.15 + bonus * 0.5;
      case 'piercing-shot': return 1.75 + bonus;
      case 'triple-volley': return 0.62 + bonus * 0.35;
      default: return 1.65 + bonus;
    }
  }

  private castBenevolence(attacker: UnitData) {
    const target = this.units.filter(unit => unit.team === 'ally' && unit.alive && unit.hp < unit.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!target) {
      this.showToast('全队状态良好，暂时不需要仁德援护。');
      return;
    }
    const level = this.skillLevels[attacker.id] ?? 0;
    const healed = Math.min(target.maxHp - target.hp, Math.floor(attacker.attack * (1.15 + level * 0.08)));
    target.hp += healed;
    attacker.acted = true;
    attacker.moved = true;
    this.activeSkill = false;
    this.guideLine = `${attacker.name}施展「仁德援护」，${target.name}恢复 ${healed} 点生命！`;
    this.animateHeal(target, healed);
    this.refreshBattleSelection();
    this.updateHud();
    if (this.autoMode) this.scheduleOnce(() => this.runAutoPlayerStep(0), 0.45);
  }

  private animateHeal(target: UnitData, amount: number) {
    const viewNode = this.unitViews.get(target.id);
    if (!viewNode || !this.canvasNode) return;
    const image = viewNode.getChildByName(`Art-${target.id}`)?.getComponent(Sprite);
    if (image) tween(image).to(0.12, { color: new Color(166, 255, 189, 255) }).to(0.32, { color: Color.WHITE }).start();
    const [x, y] = this.cellPosition(target.col, target.row);
    const popup = this.label(this.canvasNode, 'Heal-Popup', `+${amount}`, x + 18, y + 136, 148, 46, 28, new Color(150, 255, 185, 255), true);
    const node = popup.node;
    const opacity = node.addComponent(UIOpacity);
    tween(node).to(0.55, { position: new Vec3(x + 18, y + 181, 0) }).start();
    tween(opacity).delay(0.2).to(0.34, { opacity: 0 }).call(() => node.destroy()).start();
    this.updateHealth(target);
  }

  private sevenAdvancesCell(attacker: UnitData, target: UnitData) {
    const reachable = Array.from(this.reachableCells(attacker)).map(key => {
      const [col, row] = key.split(',').map(Number);
      return { col, row, distance: this.distance(col, row, target.col, target.row) };
    }).filter(cell => cell.distance === 1).sort((a, b) => this.distance(attacker.col, attacker.row, a.col, a.row) - this.distance(attacker.col, attacker.row, b.col, b.row));
    return reachable[0] ?? null;
  }

  private resolveSevenAdvances(attacker: UnitData, spot: { col: number; row: number }) {
    if (this.page !== 'battle' || !attacker.alive || this.units.some(unit => unit.alive && unit.id !== attacker.id && unit.col === spot.col && unit.row === spot.row)) return;
    const old = this.cellPosition(attacker.col, attacker.row);
    attacker.col = spot.col;
    attacker.row = spot.row;
    const next = this.cellPosition(attacker.col, attacker.row);
    const viewNode = this.unitViews.get(attacker.id);
    if (viewNode) {
      viewNode.setPosition(old[0], old[1] - 2, 0);
      tween(viewNode).to(0.34, { position: new Vec3(next[0], next[1] - 2, 0) }, { easing: 'backOut' }).start();
    }
    if (this.collectScrollAtCell(spot.col, spot.row)) this.refreshGuide();
    this.drawCells();
  }

  private animateHit(attacker: UnitData, target: UnitData, damage: number, skill = false) {
    const a = this.unitViews.get(attacker.id);
    const d = this.unitViews.get(target.id);
    const [ax, ay] = this.cellPosition(attacker.col, attacker.row);
    const [tx, ty] = this.cellPosition(target.col, target.row);
    if (a) {
      const base = new Vec3(ax, ay - 2, 0);
      const strikeX = ax + (attacker.team === 'ally' ? 38 : -38);
      tween(a).to(0.16, { position: new Vec3(strikeX, ay + 8, 0) }, { easing: 'quadOut' }).to(0.13, { position: base }, { easing: 'backOut' }).start();
    }
    if (d) {
      tween(d).to(0.07, { position: new Vec3(tx + 13, ty - 2, 0) }).to(0.09, { position: new Vec3(tx - 8, ty - 2, 0) }).to(0.08, { position: new Vec3(tx + 3, ty - 2, 0) }).to(0.1, { position: new Vec3(tx, ty - 2, 0) }).start();
      const image = d.getChildByName(`Art-${target.id}`)?.getComponent(Sprite);
      if (image) {
        tween(image).to(0.08, { color: new Color(255, 160, 132, 255) }).to(0.3, { color: Color.WHITE }).start();
      }
    }
    const burst = this.plate(this.canvasNode!, 'Impact-Flash', tx, ty + 80, skill ? 116 : 78, skill ? 116 : 78, skill ? new Color(255, 222, 126, 148) : new Color(255, 245, 200, 145), 58);
    const opacity = burst.addComponent(UIOpacity);
    tween(burst).to(0.33, { scale: new Vec3(1.8, 1.8, 1) }).start();
    tween(opacity).to(0.36, { opacity: 0 }).call(() => burst.destroy()).start();
    this.label(this.canvasNode!, 'Damage-Popup', `${skill ? '✦ ' : ''}${damage}`, tx + 25, ty + 145, 168, 52, 30, new Color(255, 243, 183, 255), true);
    const popups = this.canvasNode!.children.filter(node => node.name === 'Damage-Popup');
    const popup = popups[popups.length - 1];
    const popupOpacity = popup.addComponent(UIOpacity);
    tween(popup).to(0.56, { position: new Vec3(tx + 25, ty + 192, 0) }).start();
    tween(popupOpacity).delay(0.22).to(0.32, { opacity: 0 }).call(() => popup.destroy()).start();
    const sceneShake = this.plate(this.canvasNode!, 'Screen-Impact', 0, 0, this.screenW, this.screenH, new Color(255, 255, 255, 1), 0);
    sceneShake.setSiblingIndex(this.canvasNode!.children.length - 1);
    tween(sceneShake).to(0.035, { position: new Vec3(-7, 0, 0) }).to(0.04, { position: new Vec3(5, 0, 0) }).to(0.05, { position: new Vec3(-2, 0, 0) }).to(0.05, { position: new Vec3(0, 0, 0) }).call(() => sceneShake.destroy()).start();
    this.updateHealth(target);
    this.syncUnitStatusView(target);
  }

  private attackDamage(attacker: UnitData, target: UnitData, multiplier = 1) {
    const advantage = this.hasAdvantage(attacker.role, target.role) ? 1.25 : 1;
    let passive = 1;
    if (attacker.id === 'guan-yu' && target.hp / target.maxHp >= 0.6) passive *= 1.2;
    if (attacker.id === 'huang-zhong' && this.distance(attacker.col, attacker.row, target.col, target.row) >= 3) passive *= 1.25;
    if (attacker.id === 'zhao-yun' && attacker.counterReady) passive *= 1.4;
    return Math.floor(attacker.attack * advantage * passive * multiplier);
  }

  private applyDamage(target: UnitData, rawDamage: number) {
    let mitigation = 1;
    if (target.team === 'ally' || target.team === 'objective') {
      const liuBei = this.units.find(unit => unit.id === 'liu-bei' && unit.team === 'ally' && unit.alive);
      if (liuBei && liuBei.id !== target.id && this.distance(liuBei.col, liuBei.row, target.col, target.row) <= 1) mitigation *= 0.8;
    }
    const damage = Math.max(1, Math.floor(rawDamage * mitigation));
    const previousHp = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) target.alive = false;
    if (target.team === 'ally' && target.id === 'zhao-yun' && target.alive) target.counterReady = true;
    if (target.team === 'objective') this.refreshObjectiveHud();
    return previousHp - target.hp;
  }

  private toggleSkill() {
    if (this.phase !== 'player') return;
    const selected = this.units.find(unit => unit.id === this.selectedId && unit.alive && unit.team === 'ally');
    if (!selected || selected.acted) {
      this.showToast('请先选择本回合还能行动的友军。');
      return;
    }
    if (this.selectedSkill(selected.id).id === 'benevolence') {
      this.castBenevolence(selected);
      return;
    }
    this.activeSkill = !this.activeSkill;
    const name = this.skillName(selected.id);
    this.guideLine = this.activeSkill ? `名将技已准备：选择射程内的敌军施展「${name}」。` : '名将技已收起。';
    this.drawCells();
    this.refreshBattleSelection();
  }

  private refreshBattleSelection() {
    if (!this.canvasNode) return;
    this.drawCells();
    for (const unit of this.units) {
      const viewNode = this.unitViews.get(unit.id);
      if (!viewNode || unit.team !== 'ally') continue;
      let ring = viewNode.getChildByName('Active-Ring');
      if (unit.id === this.selectedId && !ring) ring = this.plate(viewNode, 'Active-Ring', 0, -129, 152, 18, new Color(255, 213, 93, 150), 9);
      if (unit.id !== this.selectedId && ring) ring.destroy();
    }
    this.refreshSelectedCard();
    this.refreshGuide();
    const skillLabel = this.canvasNode.children.find(node => node.name === 'Button-名将技-选择目标');
    const title = skillLabel?.getChildByName('Title')?.getComponent(Label);
    if (title) title.string = this.skillButtonText();
    const autoButton = this.canvasNode.children.find(node => node.name.startsWith('Button-自动战斗'));
    const autoTitle = autoButton?.getChildByName('Title')?.getComponent(Label);
    if (autoTitle) autoTitle.string = this.autoMode ? '自动战斗 · 开' : '自动战斗 · 关';
  }

  private refreshGuide() {
    if (this.guideLabel) this.guideLabel.string = this.guideLine;
  }

  private battleObjectiveText() {
    if (this.eventObjective === 'escort') {
      const escort = this.units.find(unit => unit.id === this.escortUnitId);
      const distance = escort ? Math.max(0, 7 - escort.col) : 7;
      return `护送献帝车驾 · 距离终点 ${distance} 格 · 车驾生命 ${escort?.hp ?? 0}/${escort?.maxHp ?? 760}`;
    }
    if (this.eventObjective === 'collect') return `搜集散落的兵书 · ${this.collectedScrolls}/3 · 金色光点是目标位置`;
    return '戰場目標 · 擊敗所有敵軍';
  }

  private refreshObjectiveHud() {
    if (this.objectiveLabel) this.objectiveLabel.string = this.battleObjectiveText();
  }

  private updateHud() {
    const info = this.turnLabel;
    if (info) info.string = this.phase === 'player' ? `第 ${this.turn} 回合 · 我方行动` : `第 ${this.turn} 回合 · 敌方行动`;
  }

  private toggleAuto() {
    this.autoMode = !this.autoMode;
    this.showToast(this.autoMode ? '自动战斗开启，可随时手动控制。' : '自动战斗已暂停。');
    this.refreshBattleSelection();
    if (this.autoMode && this.phase === 'player') this.scheduleOnce(() => this.runAutoPlayerStep(0), 0.35);
  }

  private skillButtonText() {
    const selected = this.units.find(unit => unit.id === this.selectedId && unit.alive && unit.team === 'ally');
    const heroId = selected?.id ?? this.selectedId;
    const skill = this.skillName(heroId);
    if (this.selectedSkill(heroId).id === 'benevolence') return `${skill} · 治疗友军`;
    return this.activeSkill ? `${skill} · 选敌` : `名将技 · ${skill}`;
  }

  private runAutoPlayerStep(index: number) {
    if (!this.autoMode || this.phase !== 'player') return;
    const allies = this.units.filter(unit => unit.team === 'ally' && unit.alive);
    if (index >= allies.length) {
      this.endPlayerTurn();
      return;
    }
    const ally = allies[index];
    this.selectedId = ally.id;
    const target = this.closestEnemy(ally);
    if (!target) {
      this.scheduleOnce(() => this.runAutoPlayerStep(index + 1), 0.12);
      return;
    }
    const dist = this.distance(ally.col, ally.row, target.col, target.row);
    if (dist <= ally.range && !ally.acted) {
      this.attackSelected(target);
      this.scheduleOnce(() => this.runAutoPlayerStep(index + 1), 0.72);
    } else if (!ally.moved && !ally.acted) {
      const spot = this.bestMove(ally, target);
      if (spot) {
        this.onCellTap(spot.col, spot.row);
        this.scheduleOnce(() => {
          const now = this.distance(ally.col, ally.row, target.col, target.row);
          if (now <= ally.range && !ally.acted) this.attackSelected(target);
          this.scheduleOnce(() => this.runAutoPlayerStep(index + 1), 0.72);
        }, 0.34);
      } else this.scheduleOnce(() => this.runAutoPlayerStep(index + 1), 0.15);
    } else this.scheduleOnce(() => this.runAutoPlayerStep(index + 1), 0.12);
  }

  private endPlayerTurn() {
    if (this.page !== 'battle' || this.phase !== 'player') return;
    this.phase = 'enemy';
    this.updateHud();
    this.guideLine = `${this.enemyGroupName()}正在行动，留意后排谋士和射手。`;
    this.refreshGuide();
    this.scheduleOnce(() => this.enemyTurnStep(0), 0.35);
  }

  private enemyTurnStep(index: number) {
    if (this.page !== 'battle') return;
    const enemies = this.units.filter(unit => unit.team === 'enemy' && unit.alive);
    if (index >= enemies.length) {
      if (this.eventObjective === 'escort' && !this.advanceEscort()) return;
      this.phase = 'player';
      this.turn += 1;
      for (const unit of this.units) {
        if (unit.team === 'ally') { unit.moved = false; unit.acted = false; }
        else { unit.moved = false; unit.acted = false; }
      }
      const first = this.units.find(unit => unit.team === 'ally' && unit.alive);
      if (first) this.selectedId = first.id;
      this.guideLine = this.autoMode ? '自动战斗继续执行；也可以关闭自动，自己点格走位。' : '轮到我方！根据职业克制调整站位，再集中火力。';
      this.refreshBattleSelection();
      this.updateHud();
      this.refreshObjectiveHud();
      if (this.autoMode) this.scheduleOnce(() => this.runAutoPlayerStep(0), 0.35);
      return;
    }
    const enemy = enemies[index];
    if (enemy.stunnedTurns > 0) {
      enemy.stunnedTurns -= 1;
      enemy.acted = true;
      this.syncUnitStatusView(enemy);
      this.guideLine = `${enemy.name}被眩晕，跳过了这一回合！`;
      this.refreshGuide();
      this.scheduleOnce(() => this.enemyTurnStep(index + 1), 0.32);
      return;
    }
    const target = this.closestAlly(enemy);
    if (!target) { this.finishBattle(false); return; }
    const distance = this.distance(enemy.col, enemy.row, target.col, target.row);
    if (distance > enemy.range) {
      const spot = this.bestMove(enemy, target);
      if (spot) {
        const from = this.cellPosition(enemy.col, enemy.row);
        enemy.col = spot.col;
        enemy.row = spot.row;
        enemy.moved = true;
        const actor = this.unitViews.get(enemy.id);
        const to = this.cellPosition(enemy.col, enemy.row);
        if (actor) tween(actor).to(0.34, { position: new Vec3(to[0], to[1] - 2, 0) }, { easing: 'backOut' }).start();
        this.drawCells();
      }
    }
    const nowDist = this.distance(enemy.col, enemy.row, target.col, target.row);
    this.scheduleOnce(() => {
      if (nowDist <= enemy.range && target.alive) {
        const damage = this.attackDamage(enemy, target);
        const actualDamage = this.applyDamage(target, damage);
        this.animateHit(enemy, target, actualDamage, false);
        if (target.id === this.selectedId) this.refreshSelectedCard();
        const protectedText = this.units.some(unit => unit.id === 'liu-bei' && unit.team === 'ally' && unit.alive && unit.id !== target.id && this.distance(unit.col, unit.row, target.col, target.row) <= 1) ? '刘备的仁心护住了队友。' : '';
        this.guideLine = `${enemy.name}出击，造成 ${actualDamage} 点伤害！${protectedText}`;
        this.refreshGuide();
      }
      this.scheduleOnce(() => {
        if (!target.alive) this.unitViews.get(target.id)?.destroy();
        if (!this.units.some(unit => unit.team === 'ally' && unit.alive)) { this.finishBattle(false); return; }
        this.checkBattleResult();
        if (this.page !== 'battle') return;
        this.enemyTurnStep(index + 1);
      }, 0.62);
    }, 0.42);
  }

  private bestMove(unit: UnitData, target: UnitData) {
    let best: { col: number; row: number } | null = null;
    let bestScore = this.distance(unit.col, unit.row, target.col, target.row);
    for (const point of this.reachableCells(unit)) {
      const [col, row] = point.split(',').map(Number);
      const score = this.distance(col, row, target.col, target.row);
      if (score < bestScore) { bestScore = score; best = { col, row }; }
    }
    return best;
  }

  private reachableCells(unit: UnitData) {
    const occupied = new Set(this.units
      .filter(other => other.alive && other.id !== unit.id)
      .map(other => `${other.col},${other.row}`));
    const reached = new Set<string>();
    const visited = new Set<string>([`${unit.col},${unit.row}`]);
    const queue: Array<{ col: number; row: number; steps: number }> = [{ col: unit.col, row: unit.row, steps: 0 }];
    const directions: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (current.steps >= unit.move) continue;
      for (const [dx, dy] of directions) {
        const col = current.col + dx;
        const row = current.row + dy;
        const key = `${col},${row}`;
        if (col < 0 || col >= 8 || row < 0 || row >= 4 || visited.has(key) || occupied.has(key)) continue;
        visited.add(key);
        reached.add(key);
        queue.push({ col, row, steps: current.steps + 1 });
      }
    }
    return reached;
  }

  private closestEnemy(unit: UnitData) {
    return this.units.filter(other => other.team === 'enemy' && other.alive).sort((a, b) => this.distance(unit.col, unit.row, a.col, a.row) - this.distance(unit.col, unit.row, b.col, b.row))[0];
  }

  private closestAlly(unit: UnitData) {
    return this.units.filter(other => (other.team === 'ally' || (this.eventObjective === 'escort' && other.team === 'objective')) && other.alive)
      .sort((a, b) => {
        const aScore = this.distance(unit.col, unit.row, a.col, a.row) - (a.team === 'objective' ? 1 : 0);
        const bScore = this.distance(unit.col, unit.row, b.col, b.row) - (b.team === 'objective' ? 1 : 0);
        return aScore - bScore;
      })[0];
  }

  private advanceEscort() {
    const escort = this.units.find(unit => unit.id === this.escortUnitId && unit.alive);
    if (!escort) {
      this.finishBattle(false);
      return false;
    }
    if (escort.col >= 7) {
      this.finishBattle(true);
      return false;
    }
    const nextCol = escort.col + 1;
    const openRows = [escort.row, 3, 2, 1, 0].filter((row, index, rows) => rows.indexOf(row) === index);
    const nextRow = openRows.find(row => !this.units.some(unit => unit.alive && unit.id !== escort.id && unit.col === nextCol && unit.row === row));
    if (nextRow === undefined) {
      this.guideLine = '道路被堵住了！先清開前方棋格，車駕才能繼續前進。';
      this.refreshGuide();
      return true;
    }
    const old = this.cellPosition(escort.col, escort.row);
    escort.col = nextCol;
    escort.row = nextRow;
    const target = this.cellPosition(escort.col, escort.row);
    const viewNode = this.unitViews.get(escort.id);
    if (viewNode) {
      viewNode.setPosition(old[0], old[1] - 2, 0);
      tween(viewNode).to(0.42, { position: new Vec3(target[0], target[1] - 2, 0) }, { easing: 'backOut' }).start();
    }
    this.drawCells();
    this.refreshObjectiveHud();
    if (escort.col >= 7) {
      this.guideLine = '車駕安全抵達！護送成功！';
      this.finishBattle(true);
      return false;
    }
    this.guideLine = `車駕向前推進，還差 ${7 - escort.col} 格抵達終點。`;
    this.refreshGuide();
    return true;
  }

  private finishBattle(won: boolean) {
    if (this.page !== 'battle') return;
    this.page = 'result';
    const finishedStage = this.campaignStage;
    const finishedName = this.stageName;
    const finishedMode = this.battleMode;
    const finishedEvent = this.battleEvent;
    let rewardText = '';
    if (won && finishedMode === 'story') {
      this.cityGold += 260;
      this.cultivation += 8;
      this.equipmentBlueprints += 1;
      if (finishedStage >= this.unlockedChapter) this.unlockedChapter = Math.min(2, finishedStage + 1);
      rewardText = '获得 260 铜钱 · 8 修为 · 1 张进阶图纸';
    } else if (won && finishedMode === 'tower') {
      const clearedFloor = this.towerFloor;
      const goldReward = 120 + clearedFloor * 35;
      const cultivationReward = 10 + clearedFloor * 2;
      this.cityGold += goldReward;
      this.cultivation += cultivationReward;
      this.towerFloor += 1;
      rewardText = `获得 ${goldReward} 铜钱 · ${cultivationReward} 修为`;
    } else if (won && finishedMode === 'arena') {
      this.arenaWinStreak += 1;
      const pointReward = 30 + Math.min(5, this.arenaWinStreak - 1) * 10;
      this.arenaPoints += pointReward;
      this.arenaHonor += 15;
      rewardText = `竞技积分 +${pointReward} · 荣誉值 +15 · 连胜 ${this.arenaWinStreak}`;
    } else if (won && finishedMode === 'event') {
      if (finishedEvent === '名将列传') {
        this.generalFragments += 5;
        rewardText = '获得 5 个名将信物';
      } else if (finishedEvent === '营救献帝') {
        this.cityGold += 500;
        rewardText = '获得 500 铜钱';
      } else {
        this.cultivation += 30;
        rewardText = '获得 30 修为';
      }
    } else if (won) {
      this.cityGold += 80;
      rewardText = '获得 80 铜钱';
    } else if (finishedMode === 'arena') {
      this.arenaWinStreak = 0;
    }
    this.saveGame();
    this.campaignStage = -1;
    this.clearCanvas();
    this.background(this.frames['battle-grid-cute'] ? 'battle-grid-cute' : 'battle-grid');
    const veil = this.plate(this.canvasNode!, 'Result-Veil', 0, 0, this.screenW, this.screenH, new Color(29, 26, 31, 177), 0);
    const card = this.plate(veil, 'Result-Card', 0, 10, 720, 530, new Color(255, 248, 229, 255), 38, new Color(255, 255, 246, 255));
    this.label(card, 'Result-Title', won ? '旗开得胜！' : '暂时撤退', 0, 157, 600, 60, 40, won ? new Color(186, 91, 69, 255) : new Color(105, 97, 91, 255), true);
    this.label(card, 'Result-Text', won ? `${finishedName}战局已稳，敌军退散。` : '整理阵容后，再来挑战这一关。', 0, 91, 590, 34, 20, new Color(122, 93, 71, 255));
    if (won) this.label(card, 'Reward', rewardText, 0, 30, 620, 42, 20, new Color(170, 111, 51, 255), true);
    this.sprite(card, 'Result-Mascot', won ? 'hero-taoyao' : 'hero-liubei', -230, -85, 190, 228);
    this.actionButton(card, '回到桃源仙都', 131, -170, 218, 66, () => this.renderCity(), new Color(82, 146, 129, 255), 18);
    this.actionButton(card, '再战一次', -145, -170, 218, 66, () => this.replayBattle(finishedName, finishedStage, finishedMode, finishedEvent), new Color(205, 91, 86, 255), 18);
  }

  private replayBattle(name: string, stage: number, mode: BattleMode, eventName: string) {
    if (mode === 'event') {
      const remaining = this.eventAttempts[eventName] ?? 0;
      if (remaining <= 0) {
        this.showToast('今日次数已用完，明天再来挑战。');
        return;
      }
      this.eventAttempts[eventName] = remaining - 1;
      this.saveGame();
    }
    this.startBattle(name, stage, mode, eventName);
  }

  private checkBattleResult() {
    if (this.eventObjective === 'escort') {
      const escort = this.units.find(unit => unit.id === this.escortUnitId);
      if (!escort?.alive) this.finishBattle(false);
      else if (escort.col >= 7) this.finishBattle(true);
      return;
    }
    if (this.eventObjective === 'collect') {
      if (this.collectedScrolls >= 3) this.finishBattle(true);
      return;
    }
    if (!this.units.some(unit => unit.team === 'enemy' && unit.alive)) this.finishBattle(true);
  }

  private cellPosition(col: number, row: number): [number, number] {
    const cellH = this.boardHeight / 4;
    const rowWidth = this.boardWidth * (0.795 + row * 0.0683333);
    const cellW = rowWidth / 8;
    const left = -rowWidth / 2;
    const gridY = -14;
    return [left + cellW * (col + 0.5), gridY + this.boardHeight / 2 - cellH * (row + 0.5)];
  }

  private distance(aCol: number, aRow: number, bCol: number, bRow: number) {
    return Math.abs(aCol - bCol) + Math.abs(aRow - bRow);
  }

  private hasAdvantage(a: Role, b: Role) {
    return (a === '战士' && b === '射手') || (a === '射手' && b === '谋士') || (a === '谋士' && b === '战士');
  }
}
