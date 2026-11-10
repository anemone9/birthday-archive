# Birthday Archive Generator

中英文使用说明 / Chinese and English guide

在线体验 / Live template: https://birthday-archive-generator.grittykingfisher2.chatgpt.site/

## 中文

### 项目介绍

一个可自定义的生日信与礼物揭晓网站模板。编辑者可以写一封信，添加礼物照片或 GLB 模型，并生成只读分享页。

### 在线使用

1. 打开上方在线模板，选择“编辑我的礼物”。
2. 填写页面标题、收件人称呼、生日信、署名和最后庆祝页面的按钮文字。
3. 编辑礼物名称、拆开前的提示语、挑选理由，也可以为礼物添加照片或 GLB 2.0 模型。
4. 在“封面与生日信”中可以上传 PNG、JPEG 或 WebP 信封背景图片，最大 8MB；未上传时使用默认图案。
5. 草稿保存在当前浏览器。跨设备编辑时，请先导出备份，再在另一台设备导入。
6. 完成后选择“生成只读链接”，等待内容和媒体上传完成，再复制链接分享。

收件人打开分享链接后只能浏览，不能编辑。生成分享页会把个性化文字、信封背景图片、照片和模型上传到网站服务端。持有链接的人都可以查看。当前版本没有撤销已生成分享页的按钮，清空本地草稿也不会删除已生成的分享页。请先检查内容，再生成和分享链接。

礼物编辑器支持多份礼物，最多 12 份。图像可使用 PNG、JPEG 或 WebP。模型使用 GLB 2.0，模型贴图需要嵌入 GLB 文件。请不要把生日档案备份、私人照片、模型文件或凭据提交到源码仓库。

### 清空自定义内容

在编辑页选择“清空自定义数据”，可以把当前浏览器中的草稿恢复为通用模板。该操作不影响其他浏览器中的草稿，也不会撤销已生成的只读分享链接。需要保留内容时，请先导出备份。

### 本地开发

需要 Node.js 22.13 或更新版本。

1. 克隆仓库并运行 npm run install:ci 安装依赖。
2. 检查 .openai/hosting.json。模板配置使用 DB 和 BUCKET 作为 D1 与 R2 绑定名。部署到自己的 Sites 项目之前，请把 project_id 替换为自己创建项目后获得的编号。
3. 运行 npm run dev，开发服务器默认使用本机 5173 端口。
4. 运行 npm run build，生成部署构建。

生成分享链接需要可用的 D1 数据库和 R2 文件存储。生产部署前，请按顺序应用 drizzle 目录中的数据库迁移，并在自己的托管平台配置 DB 与 BUCKET 绑定。

### 图片素材

public/melody-strawberry-pattern.webp 和 public/melody-strawberry-tile.webp 中的美乐蒂主题图案属于第三方角色素材，不属于软件源码授权。重新发布或商业使用前，请确认你拥有相应权利，或替换为自己有权使用的图片。

### 许可说明

软件源码采用 MIT 许可证，详见 LICENSE。该许可只覆盖软件源码，不覆盖生日照片、蝴蝶结图片、美乐蒂主题图案或其他媒体素材。美乐蒂主题图案属于第三方角色素材，重新发布或商业使用前，请确认你拥有相应权利，或替换为自己有权使用的图片。

## English

### About

A customizable birthday letter and gift reveal website template. Write a letter, add gift photos or GLB models, and create a read only page to share.

### Use the hosted generator

1. Open the live template above and choose “编辑我的礼物” (Edit my gifts).
2. Add the page title, recipient, birthday letter, signature, and final celebration button label.
3. Edit each gift name, guessing hint, and personal reason. Add a photo or a GLB 2.0 model if desired.
4. In “封面与生日信”, upload an optional PNG, JPEG, or WebP envelope background, up to 8 MB. The default artwork remains when no image is uploaded.
5. Drafts are stored in the current browser. To continue on another device, export a backup and import it there.
6. Choose “生成只读链接” (Generate read only link). Wait for the text and media uploads to finish, then copy and share the link.

Recipients can browse a shared page but cannot edit it. Generating a page uploads its personalized text, envelope background, photos, and models to the hosted service. Anyone with the link can view it. There is currently no button to revoke a generated page. Clearing the local draft does not remove an existing shared page. Review the content before generating and sharing a link.

The editor supports up to 12 gifts. Images can be PNG, JPEG, or WebP. Models must use GLB 2.0, with textures embedded in the GLB file. Do not commit archive backups, private photos, model files, or credentials to the source repository.

### Clear custom content

Choose “清空自定义数据” (Clear custom data) in the editor to restore the generic template in the current browser. This does not affect drafts in other browsers and does not revoke generated read only pages. Export a backup first if you want to keep the content.

### Local development

Node.js 22.13 or newer is required.

1. Clone the repository and install dependencies with npm run install:ci.
2. Check .openai/hosting.json. The template uses DB and BUCKET as the D1 and R2 binding names. Before deploying to your own Sites project, replace project_id with the ID returned when you create that project.
3. Run npm run dev. The development server uses local port 5173 by default.
4. Run npm run build to create the deployment build.

Generating share links requires an available D1 database and R2 object storage. Before production deployment, apply the database migrations in the drizzle directory in order and configure the DB and BUCKET bindings in your hosting platform.

### Image assets

The My Melody themed patterns in public/melody-strawberry-pattern.webp and public/melody-strawberry-tile.webp are third party character artwork. They are not covered by the software source license. Confirm that you have the required rights or replace these images before redistribution or commercial use.

### License

The software source is licensed under the MIT License. See LICENSE. This license covers the software source only. It does not cover birthday photos, bow images, My Melody themed artwork, or other media assets. The My Melody artwork is third party character material. Confirm that you have the required rights or replace it with artwork you are allowed to use before redistribution or commercial use.
