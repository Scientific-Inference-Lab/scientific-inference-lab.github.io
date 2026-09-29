# Pretendard Latin Assets

Official Pretendard Std v1.3.9, dynamic subset 6, distributed unchanged. The
maintainer identifies Std as the Latin-environment distribution:
https://github.com/orioncactus/pretendard/tree/main/packages/pretendard-std.
The CSS family alias is `Pretendard`; the font's embedded names are unchanged.

Download prefix:
`https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard-std/dist/web/static/woff2-dynamic-subset/`

| File | Weight | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| PretendardStd-Regular.subset.6.woff2 | 400 | 29864 | 014988aa7bab0f5dc2395b4fbcc808338cd5d490aca81f9f50b50eef731700a2 |
| PretendardStd-SemiBold.subset.6.woff2 | 600 | 30028 | ce8b2a0c2289f207ab5752a07598eeb63d016b7c17ce1edd540c76aaf6248502 |
| PretendardStd-Bold.subset.6.woff2 | 700 | 30028 | c328654f1d20b4a64947dca6fff7cbb974b088121593a377a7c39621bb1a67fa |

These three WOFF2 bodies total 89,920 bytes. The retired four Barlow Latin bodies
totalled 89,284 bytes. This is an on-disk asset comparison, not a browser transfer
measurement. Current routes may request different weights; inspect the built
page's cold network requests to measure transferred font bytes.

FontTools inspection: all printable ASCII glyphs are present; all three fonts
contain zero Hangul codepoints. `app.css` reuses the official Latin unicode range
and provides no Korean-range source. Font bytes retain their embedded OFL notice.
The distribution notice and complete upstream license are served at
`public/licenses/pretendard.txt`.

## Wordmark use

The web wordmark reuses `PretendardStd-Bold.subset.6.woff2` at weight 700.
There is no separate web font or modified subset for the name. The prior
Newsreader 600 trial was replaced after the PI found it disconnected from the
rest of the page. The off-site outlined SVG and generator are in
`docs/design/brand/`.
