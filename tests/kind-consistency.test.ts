import assert from "node:assert/strict";
import { test } from "node:test";

import { guessKind, resolveKind } from "../src/server/enrich/kind.ts";

/**
 * 线上真实错审样本：形态（kind）与频道归属。错审比漏审更糟——
 * 「真福利」里出现开源项目、「行业资讯」里出现会员权益，用户会直接失去信任。
 */
test("开源项目与开发者自荐不进真福利", () => {
  const boomo = {
    title: "【开发者自荐】BooMO：美观、直观的 Chrome 书签管理器",
    sourceId: "rss-ruanyifeng",
    category: "software",
  };
  assert.equal(guessKind(boomo), "opensource");
  // AI 判成 freebie 也要被一致性闸改回来
  assert.equal(resolveKind("freebie", true, boomo), "opensource");

  const macos = {
    title: "终于可以在 macOS 的快速查看里编辑了",
    sourceId: "linuxdo-welfare",
    category: "opensource",
  };
  assert.equal(guessKind(macos), "opensource");
  assert.equal(resolveKind("freebie", true, macos), "opensource");
});

test("会员权益不能被判成行业资讯", () => {
  const ximalaya = {
    title: "喜马拉雅会员7天*3",
    sourceId: "linuxdo-welfare",
    category: "media",
  };
  assert.equal(guessKind(ximalaya), "freebie");
  assert.equal(resolveKind("info", true, ximalaya), "freebie");
  assert.equal(resolveKind("news", true, ximalaya), "freebie");
});

test("明确领取证据仍然进真福利，不被开源规则劫持", () => {
  const studentPack = {
    title: "GitHub 学生认证免费领开发者礼包",
    sourceId: "linuxdo-welfare",
    category: "dev",
  };
  assert.equal(guessKind(studentPack), "freebie");
  assert.equal(resolveKind("freebie", true, studentPack), "freebie");
});

test("免费 VPS 仍是真福利，付费促销仍是好价", () => {
  const vps = { title: "(YMMV) nodaroo 免费VPS 6GB内存50GB储存 留档", sourceId: "linuxdo-welfare", category: "vps" };
  assert.equal(guessKind(vps), "freebie");
  const deal = { title: "RackNerd 黑五特价 2C2G KVM VPS 年付 $10.99", sourceId: "rss-lowendbox", category: "vps" };
  assert.equal(guessKind(deal), "deal");
});

test("会员涨价类报道不被当成权益发放", () => {
  const news = { title: "多家视频平台会员涨价，年卡价格上调", sourceId: "rss-ithome", category: "tech" };
  assert.equal(guessKind(news), "info");
});

test("权威新闻源与噪音判定不受影响", () => {
  const flight = "全美航班停飞4小时，普通旅客当天实际遇到了什么";
  assert.equal(guessKind({ title: flight, sourceId: "rss-chinanews-world" }), "news");
  assert.equal(guessKind({ title: flight, sourceId: "rss-smzdm" }), "info");
});
