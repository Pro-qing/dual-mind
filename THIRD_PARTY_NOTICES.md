# Bundled third-party notices / 随包第三方许可

DualMind's Webview bundle includes the following MIT-licensed packages. Their copyright and permission notice is reproduced below. Development-only packages are not bundled into the VSIX.

DualMind 的 Webview 构建包含以下 MIT 许可软件，原版权及许可声明完整保留如下。仅用于开发的软件包不打入 VSIX。

- `react` 19.3.1
- `react-dom` 19.3.1
- `scheduler` 0.28.0

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Offline command-line tools / 离线命令

Linux x64 packages also contain unmodified upstream executables: ripgrep 16.0.0, fd 10.5.2 and jq 1.8.2. Their complete upstream license files are distributed alongside the executables under `dist/tools/linux-x64/<tool>/`. The [locked asset manifest](./resources/tools/manifest.json) identifies every license file, source and digest. These commands are fallback programs for task subprocesses; development-only ZIP validation packages are not bundled into the extension code.

Linux x64 包另含未经修改的上游 ripgrep 16.0.0、fd 10.5.2、jq 1.8.2 可执行文件。完整上游许可随程序置于 `dist/tools/linux-x64/<tool>/`，文件来源与摘要见资产清单；用于开发的 ZIP 校验依赖不打入运行代码。

Additional linked-library notices include musl for the static Linux binaries, PCRE2 10.45 used by ripgrep, and the Oniguruma revision pinned by jq (`4ef89209a239c1aea328cf13c05a2807e5c146d1`). The jq COPYING file also contains its incorporated third-party notices. These files are locked and verified alongside the executables.

静态 Linux 程序随附 musl 声明，ripgrep 另附 PCRE2 10.45 声明，jq 附其固定 Oniguruma 修订的声明；jq COPYING 同时保留其他内含组件声明。上述文件与可执行文件一起锁定并校验。
