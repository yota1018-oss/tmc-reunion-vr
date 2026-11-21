// ============================================================
//  TMC同窓会VR 設定ファイル
//  会場の寸法・タイムライン・区分の色などはすべてここで変更できます。
//  （座標の単位はメートル。x = 東西, z = 南北。入口は z のプラス側）
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
// 会場（仮レイアウト）: 写真・図面をもらったら寸法と位置を修正する
//   rect: [xmin, zmin, xmax, zmax]
//   door: 部屋と廊下をつなぐ出入口 { x, z, w(幅) }（廊下側の壁の上）
//   screen: スクリーン（出入口の反対側の壁に設置）
//   kind: reception | hall | seminar | party
// ------------------------------------------------------------
export const CORRIDOR = { rect: [-2, -17, 2, 17], label: '2号館 1階 廊下（仮）' };
export const ENTRANCE = { x: 0, z: 17, label: '2号館 入口' };
export const SPAWN = { x: 0, z: 15.5, ry: 0 }; // ry=0 で北(-z)を向く

export const ZONES = [
  {
    id: 'reception', label: '受付（B101想定）', kind: 'reception',
    rect: [-11, 6, -2, 14], door: { x: -2, z: 10, w: 2.4 }, color: '#fde68a',
    sign: ['受付', '名札・未成年リボンをお受け取りください'],
  },
  {
    id: 'hall', label: 'メイン会場（開会式）', kind: 'hall',
    rect: [2, -1, 17, 14], door: { x: 2, z: 6.5, w: 3 }, color: '#bfdbfe',
    screen: { width: 6, height: 3.4 },
    sign: ['メイン会場', '開会式・全体説明'],
  },
  {
    id: 'semA', label: 'セミナー教室A（1・2年向け）', kind: 'seminar',
    rect: [-11, -4, -2, 4], door: { x: -2, z: 0, w: 2 }, color: '#bbf7d0',
    screen: { width: 4, height: 2.3 },
    sign: ['セミナーA（1・2年向け）', '大学生のうちにやるべきこと／業界・企業の選び方'],
  },
  {
    id: 'semB', label: 'セミナー教室B（3・4年向け）', kind: 'seminar',
    rect: [-11, -14, -2, -6], door: { x: -2, z: -10, w: 2 }, color: '#fbcfe8',
    screen: { width: 4, height: 2.3 },
    sign: ['セミナーB（3・4年向け）', '社会人生活の実際／キャリアの考え方'],
  },
  {
    id: 'terrace', label: '葵テラスEAST（懇親会）', kind: 'party',
    rect: [2, -17, 17, -3], door: { x: 2, z: -10, w: 3.5 }, color: '#fed7aa',
    screen: { width: 5, height: 2.8 },
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
    start: '12:30', title: '運営集合・設営', target: 'reception',
    desc: '運営は受付・会場設営。社会人の方はまだ来場前です。',
    staff: '受付4人：名札・未成年リボン・水を準備／懇親会4人：テラスの卓配置／開会式3人：スライド確認',
    crowd: { reception: 0.08, hall: 0.06, terrace: 0.06 },
    slides: { hall: [{ title: 'まもなく受付開始', sub: '第3回TMC同窓会' }] },
  },
  {
    start: '13:00', title: '受付開始', target: 'reception',
    desc: '入口から受付（B101想定）へ。名札と未成年リボンを受け取ります。',
    staff: '受付で参加費の受け取り／社会人の方を案内係がメイン会場へ誘導',
    crowd: { reception: 0.35, hall: 0.45 },
    slides: { hall: [{ title: 'ようこそ', sub: '第3回TMC同窓会〜異業種交流会〜' }, { title: '本日の流れ', sub: '開会式 → セミナー → 懇親会 → 閉会式' }] },
  },
  {
    start: '13:30', title: '開会式', target: 'hall',
    desc: 'メイン会場で開会式。代表あいさつ・先生のあいさつ・本日の流れの説明。',
    staff: '司会・資料担当は前方へ。座席指定の案内',
    crowd: { hall: 0.95, reception: 0.05 },
    slides: { hall: [{ title: '開会式', sub: '代表あいさつ' }, { title: '本日のゴール', sub: 'OBOGを通じて様々な業界や職種の人と出会う' }, { title: '本日の流れ', sub: '13:30 開会式 / 14:00 セミナー / 16:15 懇親会 / 17:45 閉会式' }] },
  },
  {
    start: '14:00', title: 'セミナー 第1部（学年別）', target: { default: 'semA', y3: 'semB', y4: 'semB' },
    desc: '1・2年はセミナーA、3・4年はセミナーBへ。社会人の方は両教室に分かれて登壇。',
    staff: 'セミナー統括は各教室の進行を確認。登壇者の自己紹介スライドを投影',
    crowd: { semA: 0.5, semB: 0.45, reception: 0.05 },
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
    desc: '葵テラスEASTへ移動。懇親会から参加の方はここで受付。',
    staff: '懇親会からの参加者の受付／テラスの食べ物準備',
    crowd: { terrace: 0.6, reception: 0.15, hall: 0.25 },
    slides: { terrace: [{ title: 'まもなく懇親会', sub: '葵テラスEAST' }] },
  },
  {
    start: '16:15', title: '懇親会', target: 'terrace',
    desc: '立食の懇親会。卓を回って様々な業界の方と交流しましょう。',
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
    start: '18:00', title: '解散・二次会へ', target: 'entrance',
    desc: '入口から退場。二次会参加の方は案内係について移動。',
    staff: '懇親会会場の原状復帰',
    crowd: { terrace: 0.3, reception: 0.1 },
    slides: { terrace: [{ title: 'ありがとうございました', sub: '第3回TMC同窓会' }] },
  },
];

// VRの手元パネル・チャットの定型文
export const QUICK_PHRASES = ['こんにちは！', 'よろしくお願いします', 'ありがとうございます', 'こっちです！'];
