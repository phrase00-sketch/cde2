"use strict";
/* ============================================================
   CDE2 — Creator Deck Editor 2  (v36)
   v36: 作品単位の保存・復元、取り消し、出力前確認を追加。ZIPの音声・コメント・相対パスと未編集文字列を保持する。
   v35: AI編集指示のMarkdownとZIPの命名を共通化し、既定名と受け渡し案内をAI共通に変更。
   v34: RENDERER2用ZIPの方式判定で、.jsだけでなく同梱.mjs/.jsx/.tsxも走査する。
        v32/v33で対応したモジュール内にだけCanvas/WebGL実装がある場合もVTを正しく宣言する。
   v33: <x-import> の from に複数列挙されたZIP内JSX/TSXを、拡張子を保持したBlob/Data URLへ個別変換し、srcdocプレビューと単体HTMLでBabel読み込みを維持する。
   v32: ZIP内の相対ES module依存グラフをimport map＋Blob/Data URLで仮想解決し、クエリ付きx-import、複数階層、循環参照をsrcdocプレビューと単体HTMLで維持する。
   v31: Chromeが file:// 画面からの自動ダウンロードを止めても生成物を失わないよう、各書き出し後に手動で押せる保存リンクを画面下へ30分間残す。RENDERER2用ZIPは動画尺警告があっても処理を続行中と明示する。
   v30: PNG保存で動画が黒く焼け、保存後のプレビューも黒く残る不具合を修正。アニメ固定を動画隠しより先に行い、復元時は動画の再表示を最後にする。Windowsのハードウェア動画は WebGL readPixels と再生クローンでフレームを取り、2Dへ写すときにY反転する。全画面のぼかし背景は文字の上へ塗り直さない。非表示シーンの動画は撮らず、再生待ちとフォント待ちに上限を付けて「PNG保存中」で止まらないようにした。
   v29: アセットカードへドラッグ＆ドロップで差し替えできるようにした。コメント添付は複数の画像／動画を追加でき、MIME空のドロップも拡張子で受け付ける。
   v28: プレビュー再生バーを二段化し、音声シークを横幅いっぱいに伸ばして位置の微調整をしやすくした。
   v27: AI用の標準出力を元ZIP指紋付きの厳密な差分ZIPへ変更。完全版は18MB以下の通常ZIPへ分割する。
         差分には編集済み本体、変更・追加素材、明示スロット変更、sidecar、添付、指示、manifestだけを含める。
   v26: AI用ZIPを、CDE2でのテキスト編集・素材差し替え・動画開始位置・スロット変更を
        実ファイルへ反映した自己完結プロジェクトとして書き出す。過去のZIPではなく同梱版を唯一の基準と明記。
        画像／動画スロットはユーザーが明示的に変更またはクリアした項目だけを指示へ載せ、
        未操作の既存素材を「未割り当て＝非表示」と誤指示しない。
   v25: 画像・動画アセットを本編のシーン順でグループ表示。
        同じ素材が複数シーンで使われていても統合せず、シーンごとに独立したカードとして表示。
        同じ動画の複製カード間では開始位置コントロールを同期する。
   v24: 動画アセットカードへ確実に見える再生コントロール付きプレビューを追加。
        デッキ内の実参照位置を本編シーンへ照合し、使用シーン名・時間帯・同一シーン内の使用回数を表示。
        使用シーンのバッジを押すと、そのシーンのプレビュー位置へ直接移動できる。
   v23: 「AIへ出力」のコピー／Markdownに、CDE2でユーザーが直接編集した最新の本体全体を
        基準版として同梱。ZIPでも出力直前に編集状態を確定してから本体と指示を作り、
        コメント対象の旧文言より現在の編集内容を優先し、コメント外の編集を戻さないよう明記。
   v22: ネイティブ .dc.html の Google Fonts / @font-face をプレビュー <head> へ先に載せ、
        support.js が <x-dc>（中の <helmet>）を置き換える前にフォント読込を開始する。
   v21: ネイティブデッキのシーン検出を本編だけに限定。<!-- SCENE n --> / sN の <sc-if> をシーンとし、
        字幕(c1..)や archive などのオーバーレイ <sc-if> を「シーンN」として出さない。
        再生追従はプレビュー時刻と BOUNDS で本編シーンを選び、字幕の文字に引っ張られない。
        字幕テキストは SUBS の時刻で本編シーンへ紐づけ、テキスト編集時もそのシーンへ移動する。
   v20: プレビューを一時停止している間だけ使える「停止画面をPNG保存」を再生バー横へ追加。
        停止中の正確な再生時刻を引き継ぎ、表示シーンをステージ原寸でPNG化する。
        ファイル名へシーン番号・時刻・寸法を付け、どの停止画面か後から判別できるようにした。
   v20-4: 実プレビューPNGでも object-fit／CSS filter／縦書きを検出したらmodern-screenshotへ切り替え、
           写真が横潰れする回帰を修正。停止時点の計算済みアニメーションスタイルは実DOMへ一時固定して撮影する。
   v20-3: html2canvas側で再開して消えるCSSアニメーション要素を、停止時点の計算済みスタイルへ固定して撮影。
   v20-2: PNG用の別画面再描画を廃止し、停止中の実プレビューDOM・動画フレーム・読込済みフォントを直接撮影。
   v20-1: performance.now()で自走するデッキのPNG用再描画にもプレビューと同じ固定時計を注入。
           描画ライブラリの準備中に裏側だけ先のシーンへ進み、停止画面と違うPNGになる不具合を修正。
   v19: 縦書き・CSS filter・object-fitを含むPNG／内蔵MP4はmodern-screenshotへ切り替え、
         html2canvas非対応CSSによる縦書きの横転を防止。縦型プレビューに「全体表示／幅に合わせる」を追加し、
         実ステージ寸法を$previewより優先。アセット差し替え種別、sidecar重複、動画ZIPのBase64重複も修正。
   v19-1: デッキ側で既に縮小されたステージへCDE側の倍率を重ね、縦型プレビューが約4分の1まで
          小さくなる場合を修正。画面上の実ステージ寸法を測り、最終表示がプレビュー領域を最大限使うよう補正する。
   v19-2: BGM追加・差し替え・解除のたびにiframe全体を再構築していた処理を廃止。再生中のデッキと
          ナレーションの位置を保ったまま、プレビュー内のBGM要素だけを更新して先頭シーンへの巻き戻りを防止。
   v18: 動画スロットの素材開始位置を0.1秒単位で設定し、CDE規格Hの data-vin として
        プレビュー／RENDERER2用ZIP／単体HTML／内蔵MP4・PNGへ一貫して反映。
        書き出し動画から autoplay / loop と独自currentTime同期を除去し、RENDERER2 v4.10の
        決定的タイムライン同期へ一本化。開始位置と不足尺警告は再読込でも復元する。
   v18-1: ZIP内アセットを指す <image-slot src="assets/...mp4"> を初期割り当てとして復元。
          スロット化した既存動画が未割り当て扱いで黒くなる問題を修正（2026-08-05）。
   v18-2: 動画開始位置の操作時、data-vin 更新だけでなく現在のCDEタイムライン位置に対応する
          素材フレームへプレビュー動画を直接再シーク。再描画なしで静止中も即時反映（2026-08-05）。
   v18-3: アセット一覧の動画にも開始位置UIを追加。同じ動画を直接参照する既存videoと、紐づく
          動画スロットへdata-vinを反映し、ZIP再読込用のsidecarへ保存（2026-08-05）。
   v17: 「テキストを直してもプレビューに反映されない」の原因2件を修正（2026-08-03）。
   v17-1: 右下「このシーン全体への指示」でシーンを選ぶと、1.2秒ごとの「再生に追従」が detectVisibleScene() →
          extractTextState() を呼び、テキスト編集フォームが束ねていた _textState を差し替えていた。以後フォームへの
          入力は捨てられ、無言で一切効かなくなる（タブを切り替えるまで復帰しない）。
          → extractTextState() は状態を保存しない。フォームは自分の state と編集した行を rebuildFromText(st, slot) に渡す。
   v17-2: 1文字打つたびに srcdoc を作り直すので、プレビューが毎回0秒へ巻き戻っていた。4.4秒以降のシーンの文字を直しても
          画面は先頭シーンのままで「反映されない」ように見える。
          → 直したテキストが載っているシーンへ移動して一時停止する（再生位置・再生/停止状態も引き継ぐ）。
          あわせて、終端で deck 側の t % duration が 0 に巻き戻り最後のフレームが先頭シーンに化けるのも修正。
   v17-3: プレビューがステージ等倍のままで、iframe に収まらない下・右の文字が画面外だった（1920x1080 の下半分＝
          タイトル面の帯や日付など）。プレビューだけ縮小して全体を映す（書き出し系は buildDcDoc(true) で従来どおり等倍）。
   v16: BGMの「同梱音声ミックス版差し替え」が黙って素通りする穴を修正（2026-08-01 実測で発覚）。
        v13の差し替えは "デッキと同じフォルダ配下" の音声しか探さなかったため、デッキが
        uploads/○○_指示一式/ に入り audio/ がZIPルートにある梱包（Claude Design側の再梱包形）だと
        候補ゼロ→警告も出さずスキップし、manifest.json の deckAudioMixed が null になっていた。
        (1) デッキ配下で見つからなければ ZIP全体から探す二段構え
        (2) ナレーションのファイル名と一致するものは複数あっても全部差し替える
        (3) 差し替え結果は成功・失敗・対象なしのいずれでも必ずログに出す（黙って素通りしない）
        (4) manifest.json の deckAudioMixed を配列化（差し替えた全パス）
        あわせて、v15までソース中に混入していた文字化け（U+FFFD）110か所を全て復元。
        画面に出るログ文言（「プレビュー生成エラー」「準備完了。」「テキストをコピー」等）も直った。
   v15: プレビュー再生ブリッジのシーン同期を state.idx / state.i の両契約に対応。契約外キーのデッキで
        シーン同期が効かず毎フレーム flushSync 再レンダが走り、境界ごとにチラつく不具合を修正。
   v14: PNG/MP4書き出しなどのステージ寸法誤検出を修正（$preview宣言→先頭ステージdiv→最大面積の順で検出）。
   v13: RENDERER2用ZIPでBGMが乗らない問題を修正。RENDERER2はデッキフォルダの音声を最優先で拾うため、同梱音声もミックス版へ差し替える。
   v12: 🎶 BGM（背景音楽）挿入を追加。ナレーション音声とは別トラックで重ね、音量スライダーで調節。
        BGMがデッキ尺より長ければ自動カット（既定で終端0.8秒フェードアウト）、短ければループ。
        プレビューは別トラックのまま同期再生。書き出し（MP4／RENDERER2用ZIP／RENDERER用ZIP）は
        オフラインでナレーション＋BGMをミックスした1本のWAVにしてから同梱するため、下流の
        RENDERER2 は改修不要。再編集用に元のナレーション（.dc-voice.json）とBGM（.dc-bgm.json）も
        ZIPへ分離保存し、読み込み時に自動復元する。
   v11: 🖼 PNG書き出しでCSS filter（brightness/saturate/contrast/drop-shadow等）のエフェクトが消える問題を修正。
        描画ライブラリ（html2canvas）がCSS filter非対応のため、書き出し直前に対象<img>へフィルタをcanvasで焼き込み、
        プレビューと同じ見た目のPNGを出力する。drop-shadow/blurは余白を自動拡張して焼き込み、位置ズレは自動補正。
        画像以外の要素にfilterがある場合は反映されない可能性があるため警告を表示。
   v10: スライダー無しデッキの内部時計をCDE2タイムラインへ同期し、CSS/WAAPIと動画をシーン相対時刻で駆動。
   v9: Claude Design標準の空白入りinline styleを含む任意のステージ寸法を確実に検出。縦1080×1920をMP4/PNG/scene.jsonへそのまま継承。
   v8: 可変ステージ対応 — 1920×1080固定を撤廃し、デッキのステージ寸法（例: 縦 1080×1920）を自動検出してMP4/PNG/scene.jsonに反映。
   - v2: 🖼 PNG書き出しを追加（サムネイル制作用）。表示中の再生位置の静止画を
     既定はステージ寸法の2/3（横型デッキなら1280×720）／Shift+クリックで原寸のPNGとして保存。
     テキスト編集・画像スロットの差し込みを反映（MP4書き出しと同じレンダリング経路）。
   ---- 以下は継承元 claude-design-editor の履歴 ----
   Claude Design Editor  (v30)
   - v30: 再生バーの横揺れ（レイアウトシフト）を解消。開発用デバッグ表示［音声…/映像…］を撤去し、時刻表示を等幅・固定幅化。
   - v29: プレビュー再生バー（再生/一時停止・シークスライダー）を追加。デッキに再生スライダーが無い場合は getAnimations() を直接シークして再生。音声挿入時は音声を基準に同期。
   - 入力: Claude Design の ZIP / 単体HTMLバンドル
   - 編集: JSX をライブ編集、アセット差し替え
   - プレビュー: 本番と同じ support.js で iframe 内描画（見た目一致）
   - 書き出し: ZIP / 単体HTML（自己展開バンドル）
   ============================================================ */
const $ = s => document.querySelector(s);
const statusEl = $("#status");
function log(msg, err){ statusEl.textContent = msg; statusEl.classList.toggle("err", !!err); if(err) console.error(msg); }

// ---- MIME helpers ----
const MIME = {webp:"image/webp",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",svg:"image/svg+xml",wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",m4v:"video/mp4",json:"application/json",csv:"text/csv",txt:"text/plain",ass:"text/plain",js:"text/javascript",jsx:"text/jsx",html:"text/html",htm:"text/html"};
function extOf(p){ const m=/\.([a-z0-9]+)$/i.exec(p||""); return m?m[1].toLowerCase():""; }
function mimeOf(p){ return MIME[extOf(p)] || "application/octet-stream"; }
function isImage(p){ return /^(webp|jpg|jpeg|png|gif|svg)$/.test(extOf(p)); }
function baseName(p){ return (p||"").split("/").pop(); }
function u8ToB64(u8){ let s=""; const C=0x8000; for(let i=0;i<u8.length;i+=C) s+=String.fromCharCode.apply(null,u8.subarray(i,i+C)); return btoa(s); }
function b64ToU8(b64){ const bin=atob(b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8; }
const dec = new TextDecoder("utf-8");
const enc = new TextEncoder();
/* ===== Optional runtime cache for compatible imported packages ===== */
const RT_KEY_S="cde_rt_support_v1", RT_KEY_I="cde_rt_imgslot_v1";
function _cdeSeedText(id){ try{ const el=document.getElementById(id); if(!el) return ""; const b64=(el.textContent||"").replace(/\s+/g,""); if(!b64) return ""; const bin=atob(b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); return dec.decode(u8); }catch(e){ return ""; } }
function rtSave(s,i){ try{ if(s) localStorage.setItem(RT_KEY_S,s); }catch(e){} try{ if(i) localStorage.setItem(RT_KEY_I,i); }catch(e){} }
function rtGetSupport(){ try{ const c=localStorage.getItem(RT_KEY_S); if(c) return c; }catch(e){} return _cdeSeedText("__cde_seed_support"); }
function rtGetImgslot(){ try{ const c=localStorage.getItem(RT_KEY_I); if(c) return c; }catch(e){} return _cdeSeedText("__cde_seed_imgslot"); }
// Cache runtime files supplied by an imported package. The public release intentionally
// does not redistribute seed runtimes of uncertain third-party provenance.
function ensureDcRuntime(){
  try{
    const haveS = M.supportPath && M.files.get(M.supportPath);
    const haveI = M.imgSlotPath && M.files.get(M.imgSlotPath);
    if(!WORKSPACE.loading) rtSave(haveS?dec.decode(M.files.get(M.supportPath).bytes):"", haveI?dec.decode(M.files.get(M.imgSlotPath).bytes):"");
    if(!M.supportPath){ const t=rtGetSupport(); if(t){ const p="__cde_runtime/support.js"; M.files.set(p,{bytes:enc.encode(t),mime:"text/javascript"}); M.supportPath=p; M._rtInjected=(M._rtInjected||0)|1; } }
    if(!M.imgSlotPath){ const t=rtGetImgslot(); if(t){ const p="__cde_runtime/image-slot.js"; M.files.set(p,{bytes:enc.encode(t),mime:"text/javascript"}); M.imgSlotPath=p; M._rtInjected=(M._rtInjected||0)|2; } }
  }catch(e){}
}

// ============================================================
// Model
// ============================================================
let M = createProjectModel();

async function sha256Hex(bytes){
  if(!globalThis.crypto||!crypto.subtle) throw new Error("このブラウザではSHA-256を計算できません");
  const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const d=new Uint8Array(await crypto.subtle.digest("SHA-256",u));
  return Array.from(d).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
}
async function captureBaseFiles(){
  const rows=await Promise.all(Array.from(M.files.entries()).map(async function(kv){
    return [kv[0],{sha256:await sha256Hex(kv[1].bytes),size:kv[1].bytes.length}];
  }));
  rows.sort(function(a,b){return a[0].localeCompare(b[0]);});
  M.baseFiles={}; rows.forEach(function(row){M.baseFiles[row[0]]=row[1];});
}

function revokeModuleUrls(){ for(const u of M.moduleBlobUrl.values()) URL.revokeObjectURL(u); M.moduleBlobUrl.clear(); }
function revokeAll(){ revokeModuleUrls(); for(const u of M.blobUrl.values()) URL.revokeObjectURL(u); M.blobUrl.clear(); }
function blobFor(path){
  if(M.blobUrl.has(path)) return M.blobUrl.get(path);
  const f=M.files.get(path); if(!f) return null;
  const u=URL.createObjectURL(new Blob([f.bytes],{type:f.mime})); M.blobUrl.set(path,u); return u;
}

// ============================================================
// Loaders
// ============================================================
