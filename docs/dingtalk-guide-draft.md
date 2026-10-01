# reference-style-restyler：在 SealSeek 中安装与使用

这款 npm 包为已有图片提供可选的视觉预设。输入一张图片，输出一张同像素尺寸的新图片。默认预设是「白场蓝色功能岛」：保留原图的人物、产品和文案内容，重新设计场景、构图、光线与文案排版。

## 在 SealSeek 中用提示词安装

把下面整段发送给 SealSeek：

```text
请安装 npm 包 @petercjl/reference-style-restyler 的最新稳定版，并把包内 reference-style-restyler Skill 安装到当前 SealSeek。先检查当前环境可用的 Node.js 和 npm；如它们不在 PATH，请从 SealSeek 当前运行时提供的安装信息定位，不要猜用户目录。安装后运行 reference-style-restyler doctor --json、reference-style-restyler adapter status --platform sealseek --json、reference-style-restyler skill install --agent sealseek --json 和 reference-style-restyler skill status --agent sealseek --json。请回报包版本、Skill 的实际安装位置与 current 状态。如果目标位置已有未纳管的同名 Skill，请保留它并先告诉我，待我确认后再备份纳管。
```

安装完成的标准：CLI 报告包版本，`skill status` 中 SealSeek 的 `managed` 与 `current` 均为 `true`。安装 Skill 不会自动授予图片生成服务权限；实际生成仍使用当前 SealSeek 提供且已获授权的参考图编辑能力。

## 手动更新

日常使用时，已通过 npm 全局安装的 CLI 每 24 小时至多检查一次 `latest` 稳定版；有新版时会自动更新 npm 包和受管 Skill。网络或更新失败不会中断当前图片任务。需要立即检查并更新时，把下面整段发送给 SealSeek：

```text
请手动检查并更新 @petercjl/reference-style-restyler 到 npm latest 稳定版。运行 reference-style-restyler update check --json，再运行 reference-style-restyler update install --json；随后用 reference-style-restyler --version、reference-style-restyler doctor --json 和 reference-style-restyler skill status --agent sealseek --json 验证准确版本与 Skill 当前状态。若目标 Skill 是未纳管的手工目录，保留它并向我报告，不要覆盖。
```

需要关闭自动更新时，在 SealSeek 执行环境设置 `REFERENCE_STYLE_RESTYLER_DISABLE_AUTO_UPDATE=1`。源代码检出目录由仓库发布流程维护，不会自行更新。

## 输入一张图片

可提供 SealSeek 能读取的本地图片路径或直接附图，并发送：

```text
请用 reference-style-restyler 的默认预设处理这张图片：【附图或填写图片路径】。保留图中的人物、产品本体以及文案的文字内容；按预设重新构建空间与排版，不只是调色。输出一张与输入完全相同像素宽高的新图片，保存到新的路径，不覆盖原图。完成后展示成图，并核对产品、文案、功能岛空间和尺寸。
```

一次任务输入一张图片。可以通过 `reference-style-restyler preset list --json` 查看方案；指定其他方案时，在提示词中填写预设 ID 或准确名称。

## 默认预设：白场蓝色功能岛

画面采用暖白无边界背景和浅灰白地面，低饱和雾蓝色的床、沙发或软榻构成唯一的大型功能岛。一件小面积、略深的木色或灰蓝家具稳定色调。人物和产品自然进入功能岛的使用关系；上方保留舒展留白，文案以纤细蓝灰色字体组织。光线接近阴天天光或大型柔光棚：明亮、漫射、低对比，形成安静柔软的安睡氛围。

卧室参考图：

![卧室功能岛：胡桃木边几](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/bedroom-a-walnut-side-table.png)

![卧室功能岛：蓝灰边柜](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/bedroom-b-blue-gray-cabinet.png)

![卧室功能岛：胡桃木矮柜](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/bedroom-c-walnut-low-cabinet.png)

客厅参考图：

![客厅功能岛：胡桃木边几](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/living-room-a-walnut-side-table.png)

![客厅功能岛：蓝灰边柜](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/living-room-b-blue-gray-cabinet.png)

![客厅功能岛：胡桃木矮柜](../skill/reference-style-restyler/presets/quiet-blue-sleep-space/references/living-room-c-walnut-low-cabinet.png)

这六张图展示预设的空间、光影与排版语言；具体生成时，输入图片中的人物、产品和文案内容仍是保真依据。
