# xianyu_card

一个用于管理闲鱼发货卡密的轻量网站，支持：

- 批量导入（自动提取为一行一个卡密）
- 分类管理（质保卡密 / 无质保卡密）
- 一键复制并标记“已复制”
- 删除当前分类中已复制的卡密
- 云端存储（电脑和手机访问同一地址可共享同一份数据）

## 项目结构

- `index.html` / `style.css` / `script.js`：前端页面
- `functions/api/cards.js`：Cloudflare Pages Functions API，用 KV 持久化卡密数据

## 本地运行（仅前端）

```bash
/usr/bin/python3 -m http.server 4173 --bind 127.0.0.1
```

然后访问 <http://127.0.0.1:4173>。

> 本地静态服务不包含 Cloudflare KV，所以会退回为本地缓存模式。

## 部署到 Cloudflare Pages（含跨设备云端存储）

1. 把本仓库推送到 GitHub。
2. 在 Cloudflare Dashboard 进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**，选择仓库。
3. 构建配置：
   - **Framework preset**: `None`
   - **Build command**: 留空
   - **Build output directory**: `/`
4. 创建 KV 命名空间（例如名字 `xianyu-card-kv`）。
5. 在 Pages 项目的 **Settings -> Functions -> KV namespace bindings** 新增绑定：
   - **Variable name**: `CARDS_KV`
   - **KV namespace**: 选择第 4 步创建的命名空间
6. 重新部署一次（或触发新 commit）。

完成后：
- 电脑端新增/复制/删除卡密会写入云端 KV。
- 手机端访问同一 Pages 地址会自动读取同一份云端数据。
