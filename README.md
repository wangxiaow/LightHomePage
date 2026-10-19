<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="白页 Logo">
</p>

<h1 align="center">白页 · LightHomePage</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-55745e.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Version-0.1.1--Alpha-55745e.svg" alt="Version: 0.1.1-Alpha">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-55745e.svg" alt="Node.js: >=22">
</p>

<p align="center">
  <a href="https://wohao.cool">在线演示</a> ·
  <a href="https://github.com/wangxiaow/LightHomePage">项目主页</a> ·
  <a href="#功能">功能介绍</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#部署">部署指南</a> ·
  <a href="#开源许可">开源许可</a>
</p>

## 简介

白页是一个轻量、简洁、可自行部署的浏览器主页。它将搜索、每日壁纸、时间天气与常用网站放在一页中，让每次打开浏览器都更顺手。

项目使用原生 HTML、CSS 和 JavaScript，无前端框架、无 npm 依赖，无需打包构建。个人设置保存在浏览器本地，无需注册账号或配置数据库。生产环境由 Nginx 提供静态页面、接口代理与缓存。

## 功能

| 功能 | 说明 |
| --- | --- |
| 多引擎搜索 | 内置百度、Google、Bing，支持拖动调整默认引擎顺序，可添加最多 6 个自定义引擎，支持快捷键切换和新标签页搜索。 |
| 本地搜索历史 | 保存最近 20 条搜索，支持点击重搜、单条删除和一键清空。 |
| 每日壁纸 | 浏览最近 8 张 Bing 壁纸，每日自动更换，也可固定喜欢的风景并保存在本地。 |
| 自然配色 | 未加载壁纸时，根据所选城市的日出日落切换日间雾白与夜间静绿背景。 |
| 时间与问候 | 时间、秒数、日期、天气和问候文字独立开关，支持切换时区与自定义问候内容。 |
| 城市天气 | 支持搜索城市或授权定位，展示当前天气并定时更新。 |
| 常用网站 | 自行添加最多 8 个常用网址，名称与入口由你决定。 |
| 个性化显示 | 调节壁纸遮罩，控制壁纸信息、全屏等入口，适配桌面与移动端。 |
| 本地保存 | 设置与搜索历史保存在当前浏览器，同一站点的多个标签页同步更新。 |

## 快速开始

### 环境准备

- Node.js 22 或更高版本。
- Git，用于克隆仓库；也可以直接下载源码。

### 本地运行

```bash
# 克隆项目
git clone https://github.com/wangxiaow/LightHomePage.git

# 进入项目目录
cd LightHomePage

# 启动本地服务
npm run dev
```

浏览器访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。项目无需运行 `npm install`。

本地服务支持以下环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 服务监听地址。 |
| `PORT` | `5173` | 服务监听端口。 |

## 部署

### Docker Compose

安装 Docker 与 Compose 插件后，在项目根目录运行：

```bash
docker compose up -d --build
```

服务默认监听宿主机的 [http://127.0.0.1:8080](http://127.0.0.1:8080)，可通过宿主机的反向代理配置域名和 HTTPS。生产容器使用 Nginx，无需运行 Node.js。

在项目根目录创建 `.env` 文件，可调整监听地址与端口：

```dotenv
BAIYE_BIND_IP=127.0.0.1
BAIYE_PORT=8080
```

若需对外直接监听，将 `BAIYE_BIND_IP` 改为 `0.0.0.0`，并按部署环境配置网络访问规则与 HTTPS。

常用命令：

```bash
# 更新源码后重新部署
docker compose up -d --build

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs --tail=50

# 停止服务
docker compose down
```

### 原生 Nginx

项目也支持直接部署到已有 Nginx 的主机：

1. 将 `public/` 目录中的文件复制到站点根目录。
2. 参考 [deploy/nginx.conf](deploy/nginx.conf)，将 `server` 配置合入现有配置，调整站点根目录、监听端口和域名，并配置 HTTPS。
3. 将其中的 `proxy_cache_path`、`limit_req_zone`、`limit_conn_zone`、`map` 和 `resolver` 指令合入 Nginx 的 `http` 配置块。
4. 将 [deploy/proxy.conf](deploy/proxy.conf) 放到 `/etc/nginx/baiye-proxy.conf`，按系统环境调整受信任 CA 文件路径。
5. 确保 Nginx 工作进程可写入 `/var/cache/nginx/baiye`，执行 `nginx -t`，通过后重新加载配置。

仓库中的完整 Nginx 配置用于独立容器；已有站点请按上述方式合并配置。部署时需同时保留页面资源与 `/api/*` 同源接口。主机需能够访问 Bing、Open-Meteo 天气接口及其城市搜索接口。

## 使用说明

### 搜索

点击搜索框上方的引擎名称即可切换搜索引擎，也可直接拖动三个默认引擎的标签调整顺序。在“设置 → 搜索”中可开启新标签页搜索、拖动默认引擎的排序手柄、添加或删除自定义引擎。排序会自动保存，首页展示和 Alt 数字快捷键同步使用新顺序；也可聚焦排序手柄后按上下方向键调整。

添加自定义引擎时，将搜索地址中的关键词替换为 `{query}`，例如：

```text
https://www.sogou.com/web?query={query}
```

输入内容后按回车或点击搜索按钮即可搜索。留空搜索会进入所选引擎主页；自定义引擎使用搜索地址所在域名的根首页。

历史搜索显示在搜索框下方，可横向滚动查看。鼠标移到条目上时显示删除按钮，触屏设备可直接操作删除入口；点击“清空”可删除全部记录。

### 个性化设置

| 设置分类 | 可配置内容 |
| --- | --- |
| 外观与组件 | 问候与自定义文字、时间、时区、秒数、日期、天气城市，以及各页面入口的显示。 |
| 搜索 | 新标签页搜索、自定义搜索引擎与快捷键说明。 |
| 壁纸 | 每日更换、固定壁纸、背景遮罩与图片中转加载偏好。 |
| 常用网站 | 添加与删除常用网址。 |
| 关于 | 项目版本、GitHub 链接、问题与建议反馈、开源许可与数据来源。 |

“换个风景”和“每日焕新”按钮默认隐藏，可在设置中开启。设置按钮会在鼠标静置 10 秒后自动隐藏，移动鼠标即可再次显示。

时区默认跟随设备，可在“设置 → 外观与组件 → 时区”中选择其他时区。时间、日期、农历与默认问候会随所选时区更新，并自动适应夏令时。

### 快捷键

| 快捷键 | 操作 |
| --- | --- |
| `/` | 聚焦搜索框。 |
| `Alt + 1` ～ `Alt + 9` | 按显示顺序切换搜索引擎。 |
| `Esc` | 关闭当前设置或确认弹层。 |

### 本地数据

设置、搜索历史与缓存数据保存在当前浏览器，壁纸副本保存在 IndexedDB 中。不同浏览器、域名、协议和端口分别保存数据，清除站点数据会删除对应的本地内容。

搜索关键词直接提交给所选搜索引擎，不发送至本站服务端。定位仅在主动操作并授权后读取，定位天气请求通过本站接口获取；也可手动选择城市。

## 目录结构

```text
LightHomePage/
├── public/            页面、样式、前端逻辑与公开许可声明
├── deploy/            Nginx 站点与代理配置
├── licenses/          第三方组件许可
├── server.mjs         本地服务与缓存代理
├── package.json       项目信息与运行命令
├── Dockerfile         Nginx 容器镜像配置
├── compose.yaml       Docker Compose 部署配置
├── LICENSE            项目 MIT 许可
└── README.md          项目说明
```

## 本地校验

```bash
# JavaScript 语法检查
npm run check
```

## 参与贡献

欢迎通过 [Pull Request](https://github.com/wangxiaow/LightHomePage/pulls) 参与改进。提交前请运行本地校验，并说明改动内容与使用方式。

## 致谢

- [Feather Icons](https://github.com/feathericons/feather)：界面图标，采用 MIT 许可。
- [Bing](https://www.bing.com/)：每日壁纸及图片来源信息。
- [Open-Meteo](https://open-meteo.com/) 与 [GeoNames](https://www.geonames.org/)：天气与城市数据。
- [NOAA GML](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)：日出日落计算参考。

第三方组件、图片和在线服务遵循各自的许可与使用条件。Bing 壁纸及 Open-Meteo 免费接口按个人非商用场景使用；天气数据采用 CC BY 4.0。完整声明见 [第三方许可与数据来源](public/third-party-notices.txt)，也可在“设置 → 关于”查看。

## 开源许可

本项目源码采用 [MIT](LICENSE) 许可。

Copyright (c) 2026 wangxiaow
