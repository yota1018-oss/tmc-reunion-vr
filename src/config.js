// ============================================================
//  TMC同窓会VR 設定ファイル
//  会場の寸法・タイムライン・区分の色などはすべてここで変更できます。
//  （座標の単位はメートル。x = 東西, z = 南北。正門は z のプラス側）
// ============================================================

export const EVENT = {
  title: '第3回TMC同窓会〜異業種交流会〜',
  date: '2027年2月27日（土）',
  place: '東京経済大学 2号館・葵テラスEAST 1階',
  goal: 'OBOGを通じて様々な業界や職種の人と出会う',
};

// Supabase（チャット・同時接続）。publishable key は公開前提のキーです。
export const SUPABASE = {
  url: 'https://gdhjbmsoukuwqfgacxqz.supabase.co',
  key: 'sb_publishable_wjwjGu_W5LkcuNvyKQ6C_A_UkiblNzn',
  channelSalt: 'tmc-reunion-vr-2027',
};

// 参加区分（名札の色）
export const CATEGORIES = [
  { id: 'shakaijin', label: '社会人', color: '#1e3a8a' },
  { id: 'obog', label: 'OB・OG', color: '#15803d' },
  { id: 'teacher', label: '先生', color: '#475569' },
  { id: 'y1', label: '現役1年', color: '#0284c7' },
  { id: 'y2', label: '現役2年', color: '#9333ea' },
  { id: 'y3', label: '現役3年', color: '#db2777' },
  { id: 'y4', label: '現役4年', color: '#ca8a04' },
  { id: 'staff', label: '運営', color: '#ea580c' },
];
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

// 業界タグの候補（自由入力も可）
export const INDUSTRIES = [
  '学生', 'メーカー', '商社', '金融・保険', 'IT・通信', 'コンサル', '広告・マスコミ',
  '小売・流通', 'サービス', '不動産・建設', '人材', '公務員', '教育', 'その他',
];

// ------------------------------------------------------------
// 2号館1階の館内図 → メートル座標への変換
//   館内図（大学の施設案内 p.105）の画像上の座標(px)で部屋を書き、ここで実寸に直す。
//   館内図の「上（エントランスホール側）」をキャンパスの西（広場・正門側）に向けて配置。
//   1px = 0.09m（建物 約28m × 34m）
// ------------------------------------------------------------
const PLAN = { x0: 36, z0: -22.25, s: 0.09, px0: 67, py0: 588 };
const r2 = (v) => Math.round(v * 100) / 100;
/** 館内図の矩形 [左, 上, 右, 下](px) → [xmin, zmin, xmax, zmax](m) */
const pr = (l, t, r, b) => [
  r2(PLAN.x0 + (t - PLAN.py0) * PLAN.s), r2(PLAN.z0 - (r - PLAN.px0) * PLAN.s),
  r2(PLAN.x0 + (b - PLAN.py0) * PLAN.s), r2(PLAN.z0 - (l - PLAN.px0) * PLAN.s),
];
/** 館内図の点(px) → 出入口 { x, z, w(幅m) } */
const pp = (px, py, w) => ({ x: r2(PLAN.x0 + (py - PLAN.py0) * PLAN.s), z: r2(PLAN.z0 - (px - PLAN.px0) * PLAN.s), w });

// ------------------------------------------------------------
// キャンパス（キャンパスマップから起こした概略配置）
//   rect: [xmin, zmin, xmax, zmax]（メートル。x=東、z=南。正門が南側）
//   venue: true の建物は中に入れる（2号館・葵テラスEAST）
//   entrances: 建物の出入口 [{ x, z, w(幅) }]（建物の外周上）
//   corridors: 建物内の歩ける通路（廊下・ホール）
//   solids: 入れない区画（トイレ・階段・EVなど）
//   signs: 館内の案内看板
// ------------------------------------------------------------
export const CAMPUS = { bounds: [-26, -146, 104, 36] };

export const BUILDINGS = [
  {
    id: 'b2', label: '2号館', rect: pr(67, 588, 439, 903), height: 16, venue: true,
    entrances: [pp(223, 588, 2.4), pp(148, 903, 1.8), pp(325, 903, 1.8)],
    entranceLabels: ['2号館 正面入口', '2号館 出入口', '2号館 出入口'],
    corridors: [pr(163, 588, 345, 695), pr(101, 648, 385, 695), pr(134, 660, 163, 903), pr(311, 660, 341, 903)],
    solids: [
      { label: '女子トイレ', rect: pr(67, 588, 121, 648) },
      { label: '階段', rect: pr(121, 588, 163, 648) },
      { label: 'EV', rect: pr(67, 648, 101, 695) },
      { label: '階段・多目的トイレ', rect: pr(345, 588, 385, 648) },
      { label: '男子トイレ', rect: pr(385, 588, 439, 665) },
      { label: '倉庫', rect: pr(385, 665, 439, 695) },
    ],
    // 館内の案内看板（face: 看板の表が向く方角 n/s/e/w、twoSided で裏面にも表示）
    signs: [
      { title: 'エントランスホール', sub: '受付はB101（左右の廊下から入室）', at: pp(254, 630), face: 'w', twoSided: true, y: 2.6 },
      { title: 'B101 受付・開会式', sub: '左右の廊下の入口から入室してください', at: pp(237, 695), face: 'w', y: 2.0, offset: 0.1 },
    ],
  },
  {
    id: 'aoiEast', label: '葵テラスEAST', rect: [-10, -86, 10, -58], height: 8, venue: true, glass: true,
    entrances: [{ x: 10, z: -64, w: 4 }],
    entranceLabels: ['葵テラスEAST 入口'],
  },
  { id: 'aoiWest', label: '葵テラスWEST', rect: [-10, -58, 10, -38], height: 8 },
  { id: 'kosei', label: '学生厚生会館', rect: [-6, -34, 8, -18], height: 9 },
  { id: 'gakusei', label: '学生会館', rect: [-8, -10, 6, 6], height: 11 },
  { id: 'b1', label: '1号館', rect: [34, -102, 70, -66], height: 20 },
  { id: 'b6', label: '6号館', rect: [2, -136, 30, -110], height: 24 },
  { id: 'c100', label: '100周年記念館', rect: [-20, -114, 0, -98], height: 10 },
  { id: 'r3', label: '第三研究センター', rect: [70, -38, 90, -16], height: 14 },
  { id: 'r1', label: '第一研究センター', rect: [74, -70, 92, -48], height: 18 },
  { id: 'b5', label: '5号館', rect: [38, -146, 66, -126], height: 16 },
];
export const buildingById = (id) => BUILDINGS.find((b) => b.id === id);

// 屋外の目印・経由点（通れる道は自動で探します）
export const PLACES = {
  gate: { x: 26, z: 24, label: '正門' },
};
export const OUTDOOR_NODES = {
  gate: [26, 20],
  plazaSouth: [30, -10],
  plazaWest: [24, -36],
  plazaMid: [24, -52],
  eastLane: [67, -38],
  eastSouth: [67, -14],
};

export const SPAWN = { x: 26, z: 18, ry: -0.18 }; // 正門から2号館の方を向く

// ------------------------------------------------------------
// 会場の部屋
//   building: どの建物の中か
//   doors: 部屋の出入口 [{ x, z, w }]（部屋の外周上）
//   screenSide: スクリーンを付ける壁 n/s/e/w（省略時は最初の出入口の反対側）
//   kind: classroom | cafeteria、reception: true で受付机を置く
// ------------------------------------------------------------
export const ZONES = [
  {
    id: 'hall', building: 'b2', label: 'B101（受付・開会式）', kind: 'classroom', reception: true,
    rect: pr(163, 695, 311, 903), screenSide: 'e', color: '#bfdbfe',
    doors: [pp(163, 712, 1.4), pp(311, 712, 1.4), pp(163, 885, 1.4), pp(311, 885, 1.4)],
    screen: { width: 4.2, height: 2.4 },
    sign: ['B101', '受付・開会式'],
  },
  {
    id: 'semA', building: 'b2', label: 'B102 教室A（1・2年向け）', kind: 'classroom',
    rect: pr(341, 695, 439, 797), doors: [pp(341, 725, 1.2)], screenSide: 'w', color: '#bbf7d0',
    screen: { width: 3, height: 1.8 },
    sign: ['B102 教室A（1・2年）', '大学生のうちにやるべきこと／業界・企業の選び方'],
  },
  {
    id: 'semB', building: 'b2', label: 'B103 教室B（3・4年向け）', kind: 'classroom',
    rect: pr(341, 797, 439, 903), doors: [pp(341, 875, 1.2)], screenSide: 'w', color: '#fbcfe8',
    screen: { width: 3, height: 1.8 },
    sign: ['B103 教室B（3・4年）', '社会人生活の実際／キャリアの考え方'],
  },
  {
    id: 'b105', building: 'b2', label: 'B105（未定・控室候補）', kind: 'classroom',
    rect: pr(67, 695, 134, 797), doors: [pp(134, 725, 1.2)], screenSide: 'w', color: '#e5e7eb',
    sign: ['B105', '未定（控室候補）'],
  },
  {
    id: 'b104', building: 'b2', label: 'B104（未定・控室候補）', kind: 'classroom',
    rect: pr(67, 797, 134, 903), doors: [pp(134, 875, 1.2)], screenSide: 'w', color: '#e5e7eb',
    sign: ['B104', '未定（控室候補）'],
  },
  {
    id: 'terrace', building: 'aoiEast', label: '葵テラスEAST（懇親会）', kind: 'cafeteria',
    rect: [-10, -86, 10, -58], doors: [{ x: 10, z: -64, w: 4 }], screenSide: 'n', color: '#fed7aa',
    screen: { width: 4.5, height: 2.5 },
    sign: ['葵テラスEAST', '懇親会・閉会式（未成年の卓にはアルコールを置きません）'],
  },
];
export const zoneById = (id) => ZONES.find((z) => z.id === id);

// ------------------------------------------------------------
// タイムライン（仮）: 時刻は分単位の "HH:MM"
//   zones: その時間に人がいる場所（{zoneId: 人数の割合}）
//   target: 参加者が向かう場所（動線ガイドの目的地）。区分ごとに変える場合は { default, y1, ... }
//   slides: スクリーンに映す内容（画像パス or {title, sub}）
//   staff: 運営向けメモ（区分「運営」のときだけ表示）
// ------------------------------------------------------------
export const DAY_START = '12:30';
export const DAY_END = '18:30';
export const EXPECTED_PEOPLE = 60; // 想定参加人数（会場の人影の数）

export const SCHEDULE = [
  {
    start: '12:30', title: '運営集合・設営', target: 'hall',
    desc: '運営は受付・会場設営。社会人の方はまだ来場前です。',
    staff: '受付4人：名札・未成年リボン・水を準備／懇親会4人：テラスの卓配置／開会式3人：スライド確認',
    crowd: { hall: 0.14, terrace: 0.06 },
    slides: { hall: [{ title: 'まもなく受付開始', sub: '第3回TMC同窓会' }] },
  },
  {
    start: '13:00', title: '受付開始', target: 'hall',
    desc: '正門から2号館の正面入口へ。エントランスホールを通ってB101の受付で名札と未成年リボンを受け取ります。',
    staff: '受付で参加費の受け取り／社会人の方を案内係が正面入口→B101へ誘導',
    crowd: { hall: 0.8 },
    slides: { hall: [{ title: 'ようこそ', sub: '第3回TMC同窓会〜異業種交流会〜' }, { title: '本日の流れ', sub: '開会式 → セミナー → 懇親会 → 閉会式' }] },
  },
  {
    start: '13:30', title: '開会式', target: 'hall',
    desc: '受付を済ませたらそのままB101で開会式。代表あいさつ・先生のあいさつ・本日の流れの説明。',
    staff: '司会・資料担当は前方へ。座席指定の案内',
    crowd: { hall: 1.0 },
    slides: { hall: [{ title: '開会式', sub: '代表あいさつ' }, { title: '本日のゴール', sub: 'OBOGを通じて様々な業界や職種の人と出会う' }, { title: '本日の流れ', sub: '13:30 開会式 / 14:00 セミナー / 16:15 懇親会 / 17:45 閉会式' }] },
  },
  {
    start: '14:00', title: 'セミナー 第1部（学年別）', target: { default: 'semA', y3: 'semB', y4: 'semB' },
    desc: '1・2年はB102（教室A）、3・4年はB103（教室B）へ。社会人の方は両教室に分かれて登壇。',
    staff: 'セミナー統括は各教室の進行を確認。登壇者の自己紹介スライドを投影',
    crowd: { semA: 0.5, semB: 0.45, hall: 0.05 },
    slides: {
      semA: [{ title: '大学生のうちにやるべきこと', sub: '1・2年向け' }, { title: '業界・企業の選び方', sub: '社会人の方の経験から' }],
      semB: [{ title: '社会人生活の実際', sub: '3・4年向け' }, { title: 'キャリアの考え方', sub: '短期と長期のバランス' }],
    },
  },
  {
    start: '15:00', title: 'セミナー 第2部（学年別）', target: { default: 'semB', y1: 'semA', y2: 'semA', y3: 'semB', y4: 'semB' },
    desc: '社会人の方が教室を入れ替えて第2部。',
    staff: '教室入れ替えの誘導',
    crowd: { semA: 0.5, semB: 0.5 },
    slides: {
      semA: [{ title: '第2部', sub: '判断基準の持ち方' }],
      semB: [{ title: '第2部', sub: '転職・キャリアアップの判断' }],
    },
  },
  {
    start: '16:00', title: '休憩・移動', target: 'terrace',
    desc: '2号館を出て、広場を通って葵テラスEASTへ移動。懇親会から参加の方はここで受付。',
    staff: '懇親会からの参加者の受付／テラスの食べ物準備／2号館→葵テラスの屋外動線に案内係を配置',
    crowd: { terrace: 0.6, hall: 0.4 },
    slides: { terrace: [{ title: 'まもなく懇親会', sub: '葵テラスEAST' }] },
  },
  {
    start: '16:15', title: '懇親会', target: 'terrace',
    desc: '葵テラスEASTで懇親会。卓を回って様々な業界の方と交流しましょう。',
    staff: '人の配置・移動で交流を増やす。未成年の卓にアルコールを置かない',
    crowd: { terrace: 1.0 },
    slides: { terrace: [{ title: '懇親会', sub: '業界ごとの卓を回ってみよう' }, { title: '参加者の業界', sub: 'メーカー / 金融 / IT / 商社 / 広告 ほか' }] },
  },
  {
    start: '17:45', title: '閉会式', target: 'terrace',
    desc: '懇親会会場でそのまま閉会式。',
    staff: '閉会式3人：司会・資料。終了後アンケートの案内',
    crowd: { terrace: 1.0 },
    slides: { terrace: [{ title: '閉会式', sub: 'ご参加ありがとうございました' }, { title: 'アンケートのお願い', sub: '終了後アンケートにご協力ください' }] },
  },
  {
    start: '18:00', title: '解散・二次会へ', target: 'gate',
    desc: '正門から退場。二次会参加の方は案内係について移動。',
    staff: '懇親会会場の原状復帰',
    crowd: { terrace: 0.3 },
    slides: { terrace: [{ title: 'ありがとうございました', sub: '第3回TMC同窓会' }] },
  },
];

// VRの手元パネル・チャットの定型文
export const QUICK_PHRASES = ['こんにちは！', 'よろしくお願いします', 'ありがとうございます', 'こっちです！'];
