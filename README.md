<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="白页 Logo">
</p>

<h1 align="center">白页 · LightHomePage</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-55745e.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Version-0.1.5--Beta-55745e.svg" alt="Version: 0.1.5-Beta">
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

项目使用原生 HTML、CSS 和 JavaScript，无前端框架、无 npm 依赖，无需打包构建。个人设置保存在浏览器本地，无需注册账号或配置数据库。开发与生产统一由 Node.js 提供静态页面、接口代理与有容量上限的内存缓存，可在前面配置 Nginx 提供 HTTPS。

## 功能

| 功能 | 说明 |
| --- | --- |
| 多引擎搜索 | 内置百度、Google、Bing，支持排序与隐藏默认引擎，可添加最多 6 个自定义引擎，支持快捷键切换和新标签页搜索。 |
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
| `TRUSTED_PROXIES` | 空 | 逗号分隔的可信反向代理 IP，仅接受准确的 IPv4/IPv6 地址。默认不信任转发头；启用后，该代理的 API 请求必须提供单个有效的 `X-Forwarded-For`。 |
| `BAIYE_ICP_NUMBER` | 空 | 页脚备案号，链接至工信部备案查询网站；留空时不显示。 |

### 页面标题与备案信息

浏览器页面标题为“我好酷”，项目名称仍为“白页”。备案号通过部署配置填入，源码中的 `<!-- ICP_REGISTRATION -->` 只作为预留位。

复制 `.env.example` 为项目根目录的 `.env`，填写 `BAIYE_ICP_NUMBER` 后重启服务。直接运行 Node.js 时会自动读取该文件；Docker Compose 会将该值传入容器，修改后执行 `docker compose up -d` 应用。已有环境变量优先于文件中的值。

`.env` 已被 Git 忽略，也不会打包进 Docker 镜像；仓库只保留空值示例，实际备案号应单独保存在部署环境中。

配置备案号后，备案链接始终显示在页面底部，独立于壁纸地点、每日焕新和全屏按钮等显示设置，访客无法通过设置关闭。

## 部署

### Docker Compose

安装 Docker 与 Compose 插件后，在项目根目录运行：

```bash
docker compose up -d --build
```

服务默认监听宿主机的 [http://127.0.0.1:8080](http://127.0.0.1:8080)。容器内运行 Node.js，宿主机无需安装 Node.js。通过反向代理公开站点时，必须按下文配置可信代理和 HTTPS。

容器以非 root 用户、只读文件系统运行，内存上限为 256 MiB。缓存总量最多 24 MiB、150 项，不写磁盘；重启后会重新获取缓存。图片响应最大 12 MiB，JSON 最大 512 KiB，上游请求包含正文读取在内最多 10 秒，超限取消且不缓存。用户保存在浏览器的设置与壁纸副本不受影响。

在项目根目录创建 `.env` 文件，可调整监听地址与端口：

```dotenv
BAIYE_BIND_IP=127.0.0.1
BAIYE_PORT=8080
# 直接访问时留空；反向代理部署时填写容器实际看到的代理 IP。
BAIYE_TRUSTED_PROXIES=
# 备案号预留位，按实际部署填写；留空时不显示。
BAIYE_ICP_NUMBER=
```

若需对外直接监听，将 `BAIYE_BIND_IP` 改为 `0.0.0.0`，并按部署环境配置网络访问规则与 HTTPS。

常用命令：

```bash
# 更新源码后获取基础镜像更新并重新部署
docker compose build --pull
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs --tail=50

# 停止服务
docker compose down
```

### Nginx / HTTPS 入口

Nginx 只转发到本项目的 Node 服务，外部 Bing/Open-Meteo 请求必须经过 Node 的大小、类型、超时与缓存检查。不要继续使用旧版直接代理外部 API 的 Nginx 配置。

1. 用 Compose 启动服务；或者在宿主机使用进程管理器运行 `HOST=127.0.0.1 PORT=8080 TRUSTED_PROXIES=127.0.0.1,::1 node server.mjs`。
2. 参考 [deploy/nginx.conf](deploy/nginx.conf)，将 `server` 配置合入现有配置，调整域名与 HTTPS 证书。示例后端为 `127.0.0.1:8080`。
3. 将 [deploy/proxy.conf](deploy/proxy.conf) 放到 `/etc/nginx/baiye-proxy.conf`。它使用 `X-Forwarded-For $remote_addr` **覆盖**访客传来的 IP，不要改成 `$proxy_add_x_forwarded_for`。
4. 为 Node 配置可信代理：原生本机部署使用 `127.0.0.1,::1`；Docker 桥接部署填写 Node 实际看到的宿主机代理地址，通常是所属网络的网关。可通过 `docker inspect "$(docker compose ps -q homepage)" --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'` 查看网关，并核对实际网络路径。将确认后的准确地址写入 `.env` 的 `BAIYE_TRUSTED_PROXIES`，执行 `docker compose up -d` 应用环境变量。
5. 后端继续绑定回环地址或限制为仅允许可信入口连接。执行 `nginx -t` 后重新加载配置；通过入口访问 `/api/bing` 应返回 200，缺少有效访客 IP 的已配置可信代理请求将返回 400。

应用按访客 IP 限制 API 请求，每分钟最多 100 次；单个访客用完配额不会占用其他访客的额度。默认忽略非可信来源的转发头，地址错误时不会自动扩大信任范围。不要填写所有网段或根据访客提供的请求头自动识别代理。

若入口前还有 CDN/负载均衡器，先在入口 Nginx 使用 `set_real_ip_from` 精确列出可信来源，再配置对应的 `real_ip_header`，使 `$remote_addr` 表示实际访客；相关来源必须由网络访问规则保证。不要将整段公网或不受控的容器网络列为可信来源。

从旧版迁移时，替换旧 Nginx 外部 API 代理配置及 `baiye-proxy.conf`，移除旧的 `proxy_cache_path` 和按后端代理地址设置的限流规则，再重建容器。新的 Compose 不再使用 `wallpaper-cache` 卷，旧缓存卷不会被自动删除。主机仍需能够访问 Bing、Open-Meteo 及城市搜索接口。

## 使用说明

### 搜索

点击搜索框上方的引擎名称即可切换搜索引擎，也可直接拖动默认引擎的标签调整顺序。在“设置 → 搜索”中可开启新标签页搜索、拖动默认引擎的排序手柄、隐藏或重新显示默认引擎、添加或删除自定义引擎。默认引擎不能删除，至少保留一个可见；隐藏当前引擎后会自动切换到可见顺序中的第一个引擎。排序和显示状态会自动保存，首页展示和 Alt 数字快捷键仅使用可见引擎；也可聚焦排序手柄后按上下方向键调整。

选择 Google 时，搜索框下方会提示“Google搜索在中国大陆地区可能无法正常工作，请您注意”。点击“不再提示”后，当前浏览器会记住选择，刷新或再次切换到 Google 时不再显示；恢复默认设置会重置此偏好。

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
├── server.mjs         开发与生产服务、有容量上限的缓存代理
├── client-address.mjs 可信代理与客户端 IP 校验
├── package.json       项目信息与运行命令
├── Dockerfile         Node.js 生产容器镜像配置
├── compose.yaml       Docker Compose 部署配置
├── LICENSE            项目 MIT 许可
└── README.md          项目说明
```

## 本地校验

```bash
# JavaScript 语法检查
npm run check
```

安全边界与本次修复的本地验证记录见 [SECURITY.md](SECURITY.md)。

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
