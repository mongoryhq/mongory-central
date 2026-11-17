import type { Preset } from "../types.js";

export const PRESETS: ReadonlyArray<Preset> = [
  {
    id: "ecommerce",
    label: "E-Commerce",
    badge: "$elemMatch",
    description:
      "Match VIP or loyalty orders over $100 containing an in-stock SKU, excluding restricted regions. Notice cheap fields run before regex & $elemMatch.",
    defaultSelectedIndex: 1,
    condition: {
      "customer.tier": { $in: ["vip", "gold"] },
      subtotal: { $gte: 100 },
      region: { $nin: ["blocked"] },
      coupon: { $regex: "^VIP\\d{2}$", $options: "i" },
      items: {
        $elemMatch: {
          inStock: true,
          qty: { $gte: 2 },
        },
      },
    },
    records: [
      {
        orderId: "ORD-101",
        customer: { name: "Ann", tier: "vip" },
        subtotal: 185,
        region: "tw",
        coupon: "vip25",
        items: [
          { sku: "KB-01", qty: 1, inStock: true },
          { sku: "MS-09", qty: 2, inStock: true },
        ],
      },
      {
        orderId: "ORD-102",
        customer: { name: "Bob", tier: "standard" },
        subtotal: 240,
        region: "us",
        coupon: "vip10",
        items: [{ sku: "KB-01", qty: 3, inStock: true }],
      },
      {
        orderId: "ORD-103",
        customer: { name: "Cid", tier: "gold" },
        subtotal: 120,
        region: "tw",
        coupon: "VIP50",
        items: [
          { sku: "HD-02", qty: 4, inStock: false },
          { sku: "MS-09", qty: 1, inStock: true },
        ],
      },
      {
        orderId: "ORD-104",
        customer: { name: "Dan", tier: "vip" },
        subtotal: 310,
        region: "jp",
        coupon: "VIP99",
        items: [{ sku: "MN-07", qty: 2, inStock: true }],
      },
    ],
  },
  {
    id: "feature-flags",
    label: "Feature Flags",
    badge: "$or · $not",
    description:
      "Target enterprise orgs or early-access beta users on app v2.4+, excluding suspended accounts and internal QA bots.",
    defaultSelectedIndex: 0,
    condition: {
      suspended: { $not: true },
      appVersion: { $gte: "2.4.0" },
      email: { $regex: "@(acme|partner)\\.io$", $options: "i" },
      $or: [{ plan: "enterprise" }, { cohorts: { $in: ["beta", "canary"] } }],
    },
    records: [
      {
        user: "elena",
        email: "elena@ACME.io",
        plan: "pro",
        appVersion: "2.5.1",
        suspended: false,
        cohorts: ["mobile", "beta"],
      },
      {
        user: "frank",
        email: "frank@acme.io",
        plan: "enterprise",
        appVersion: "2.3.9",
        suspended: false,
        cohorts: [],
      },
      {
        user: "grace",
        email: "grace@partner.io",
        plan: "enterprise",
        appVersion: "2.6.0",
        suspended: true,
        cohorts: ["canary"],
      },
      {
        user: "henry",
        email: "henry@gmail.com",
        plan: "enterprise",
        appVersion: "2.6.0",
        suspended: false,
        cohorts: ["canary"],
      },
    ],
  },
  {
    id: "rbac",
    label: "RBAC Grants",
    badge: "$every · null",
    description:
      "Allow principals where all attached tokens are active ($every), a grant covers write access ($elemMatch), and revokedAt is null or missing.",
    defaultSelectedIndex: 2,
    condition: {
      revokedAt: null,
      tokens: {
        $size: { $gte: 1 },
        $every: { active: true },
      },
      grants: {
        $elemMatch: {
          resource: "orders",
          actions: { $in: ["write", "admin"] },
        },
      },
    },
    records: [
      {
        principal: "svc-checkout",
        tokens: [
          { id: "t1", active: true },
          { id: "t2", active: true },
        ],
        grants: [
          { resource: "inventory", actions: ["read"] },
          { resource: "orders", actions: ["read", "write"] },
        ],
      },
      {
        principal: "svc-billing",
        revokedAt: null,
        tokens: [{ id: "t3", active: true }],
        grants: [{ resource: "orders", actions: ["admin"] }],
      },
      {
        principal: "svc-legacy",
        revokedAt: null,
        tokens: [
          { id: "t4", active: true },
          { id: "t5", active: false },
          { id: "t6", active: true },
        ],
        grants: [{ resource: "orders", actions: ["write"] }],
      },
      {
        principal: "svc-expired",
        revokedAt: "2026-10-01T00:00:00Z",
        tokens: [{ id: "t7", active: true }],
        grants: [{ resource: "orders", actions: ["admin"] }],
      },
    ],
  },
  {
    id: "arrays",
    label: "Array Operators",
    badge: "element [i]",
    description:
      "Inspect array-level $size range checks, $every thresholds, and MongoDB implicit $elemMatch with element [i] and skipped-element tracing.",
    defaultSelectedIndex: 0,
    condition: {
      scores: {
        $size: { $gte: 3, $lte: 5 },
        $every: { $gte: 60 },
      },
      tags: "ts",
      reviews: {
        approved: true,
        rating: { $gte: 4 },
      },
    },
    records: [
      {
        candidate: "Alice",
        tags: ["go", "ts", "rust"],
        scores: [82, 91, 77],
        reviews: [
          { reviewer: "r1", approved: false, rating: 5 },
          { reviewer: "r2", approved: true, rating: 5 },
          { reviewer: "r3", approved: true, rating: 4 },
        ],
      },
      {
        candidate: "Ben",
        tags: ["ts", "python"],
        scores: [95, 52, 88],
        reviews: [{ reviewer: "r1", approved: true, rating: 5 }],
      },
      {
        candidate: "Cara",
        tags: ["ruby", "c"],
        scores: [80, 85],
        reviews: [{ reviewer: "r1", approved: true, rating: 4 }],
      },
    ],
  },
  {
    id: "dot-priority",
    label: "Dot Paths & Priority",
    badge: "\\. · order",
    description:
      "Condition keys are intentionally ordered expensive-first ($regex -> $present -> escaped dot -> $eq). Mongory automatically reorders by evaluation priority.",
    defaultSelectedIndex: 1,
    condition: {
      note: { $regex: "urgent" },
      "meta.v2\\.enabled": true,
      payload: { $present: true },
      env: "prod",
    },
    records: [
      {
        env: "prod",
        payload: { count: 3 },
        meta: { "v2.enabled": true },
        note: "urgent hotfix needed",
      },
      {
        env: "prod",
        payload: {},
        meta: { "v2.enabled": true },
        note: "urgent hotfix needed",
      },
      {
        env: "staging",
        payload: { count: 1 },
        meta: { "v2.enabled": true },
        note: "urgent",
      },
    ],
  },
];
