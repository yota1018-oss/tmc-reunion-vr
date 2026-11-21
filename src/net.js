import { createClient } from '@supabase/supabase-js';
import { SUPABASE } from './config.js';

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 同時接続。合言葉が正しいとき（サーバーで確認）だけ、合言葉から作った部屋名のチャンネルに入る。
 * イベント: onPeerJoin(id, profile) / onPeerLeave(id) / onPose(id, pose) / onChat(msg) / onSync(state) / onStatus(text)
 */
export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.online = false;
    this.client = null;
    this.channel = null;
    this.pass = '';
    this.peers = new Map();
  }

  static async check(pass) {
    const client = createClient(SUPABASE.url, SUPABASE.key, { auth: { persistSession: false } });
    const { data, error } = await client.rpc('tmc_check', { p_pass: pass });
    if (error) throw new Error('サーバーに接続できませんでした（' + error.message + '）');
    return { ok: data === true, client };
  }

  async connect(pass, me) {
    const { ok, client } = await Net.check(pass);
    if (!ok) throw new Error('合言葉が違います');
    this.client = client;
    this.pass = pass;
    this.me = me;
    const room = 'tmc-' + (await sha256hex(SUPABASE.channelSalt + ':' + pass)).slice(0, 24);
    const ch = client.channel(room, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    this.channel = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const seen = new Set();
      for (const [id, metas] of Object.entries(state)) {
        if (id === me.id) continue;
        seen.add(id);
        const prof = metas[metas.length - 1];
        this.peers.set(id, prof);
        this.h.onPeerJoin?.(id, prof);
      }
      for (const id of [...this.peers.keys()]) {
        if (!seen.has(id)) { this.peers.delete(id); this.h.onPeerLeave?.(id); }
      }
      this.h.onStatus?.(`オンライン：${seen.size + 1}人`);
    });
    ch.on('broadcast', { event: 'pose' }, ({ payload }) => this.h.onPose?.(payload.id, payload));
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => this.h.onChat?.(payload));
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => this.h.onSync?.(payload));
    ch.on('broadcast', { event: 'hello' }, ({ payload }) => this.h.onHello?.(payload));

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('接続がタイムアウトしました')), 15000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(t);
          await ch.track(this.profilePayload(me));
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(t);
          reject(new Error('リアルタイム接続に失敗しました'));
        }
      });
    });
    this.online = true;
    // 運営の同期状態を新しく来た人に教えてもらう
    this.send('hello', { id: me.id });
  }

  profilePayload(me) {
    return { name: me.name, category: me.category, industry: me.industry, org: me.org, minor: me.minor };
  }

  async updateProfile(me) {
    if (this.online) await this.channel.track(this.profilePayload(me));
  }

  send(event, payload) {
    if (!this.online) return;
    this.channel.send({ type: 'broadcast', event, payload });
  }

  async history() {
    if (!this.online) return [];
    const { data, error } = await this.client.rpc('tmc_history', { p_pass: this.pass, p_limit: 50 });
    if (error) return [];
    return data;
  }

  async postChat(me, body) {
    const msg = { sender_id: me.id, name: me.name, category: me.category, body, created_at: new Date().toISOString() };
    if (!this.online) return msg;
    const { data, error } = await this.client.rpc('tmc_post', {
      p_pass: this.pass, p_sender_id: me.id, p_name: me.name, p_category: me.category, p_body: body,
    });
    if (error) throw new Error('送信できませんでした');
    this.send('chat', data);
    return data;
  }
}
