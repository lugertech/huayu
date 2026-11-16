# Open-source licensing

## Choice: MIT

Huayu’s own application code and documentation use the [MIT License](../../LICENSE), SPDX `MIT`. Root, React packages and Rust workspace declarations agree, without extra restrictions in the standard text.

MIT fits the goal of free commercial use, deployment and modification. It permits use, modification, redistribution and sale, including larger works under other terms, without requiring all additional code to be published. Copies or substantial portions must retain the copyright and complete license notice. The software is provided as is, without warranty. See [SPDX](https://spdx.org/licenses/MIT.html) and [Choose a License](https://choosealicense.com/licenses/mit/).

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) also allows commercial use and includes explicit contributor patent terms. Existing application and main canvas dependencies already declare MIT, so this project retains MIT.

## Scope

The root license covers only content the project is authorized to license. Dependencies, fonts, brand assets and source code retain their own terms; see [Third-party notices](./THIRD_PARTY_NOTICES.md). MIT does not grant rights to imported materials, user works or model outputs.

New contributions are normally supplied under MIT, unless explicitly agreed otherwise. Contributors retain their copyright, submit only content they may license, and preserve applicable notices.

## Dependencies

Excalidraw, React, Base UI and React Flow retain their licenses. Fonts retain OFL or their stated terms. See [Dependency licenses](./DEPENDENCY_LICENSES.md).

The checked local `aarch64-apple-darwin` Rust resolution includes 353 packages across build, development and indirect dependencies. These four use MPL-2.0:

| Crate | Version | Source |
| --- | --- | --- |
| cssparser | 0.36.0 | [Release source](https://docs.rs/crate/cssparser/0.36.0/source/) |
| cssparser-macros | 0.6.1 | [Release source](https://docs.rs/crate/cssparser-macros/0.6.1/source/) |
| dtoa-short | 0.3.5 | [Release source](https://docs.rs/crate/dtoa-short/0.3.5/source/) |
| selectors | 0.33.0 | [Release source](https://docs.rs/crate/selectors/0.33.0/source/) |

MPL permits commercial use and combination with other licenses. Distribution of compiled binaries requires telling recipients how to obtain the covered source; modifications to covered files remain under MPL. Independent application files do not all become MPL. See the [Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/#using-and-distributing-software-under-the-license), retained [MPL text](../../licenses/MPL-2.0.txt) and [source locations](../../licenses/SOURCE-NOTICES.txt). These crates’ source has not been modified here.

This records the licensing choice and checked declarations, not an exhaustive rights audit of every asset, platform or future version. Carry applicable licenses and notices with source and binaries. Frontend builds copy retained license texts automatically.
