#!/usr/bin/env python3
"""Verify the V6.1 package and generate reproducible file manifests."""

from __future__ import annotations

import csv
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if condition:
        print("PASS:", message)
    else:
        errors.append(message)
        print("FAIL:", message)


for name in [
    "00_先读我", "01_产品商业与收益规则", "02_完整PRD页面树与状态机",
    "03_UIUX原型效果图与设计资产", "04_AI对话建档客服GEO与插件", "05_数据API事件权限与安全",
    "06_测试验收与质量门禁", "07_Trae_Codex立即开发", "80_乐趣生活V5完整继承基线",
    "81_V6历史升级资料", "82_代金券冻结原件",
]:
    check((ROOT / name).is_dir(), "目录存在：" + name)

page_json = ROOT / "02_完整PRD页面树与状态机" / "页面树与页面契约" / "页面树.json"
pages = json.loads(page_json.read_text(encoding="utf-8"))
leaves = [row for row in pages if row.get("is_leaf")]
routes = [row.get("route") for row in leaves]
check(len(pages) == 307, "页面节点正好 307 个")
check(len(leaves) == 197, "可执行叶子页正好 197 个")
check(max(int(row.get("level", 0)) for row in pages) == 6, "页面层级覆盖到六级")
check(len(routes) == len(set(routes)), "叶子页路由不重复")
check(all("可恢复失败" in row.get("states", "") for row in leaves), "所有叶子页包含恢复状态")

control_csv = ROOT / "03_UIUX原型效果图与设计资产" / "Harness交互基线_仅验收控件" / "Harness交互控件矩阵.csv"
with control_csv.open(encoding="utf-8-sig", newline="") as handle:
    controls = list(csv.DictReader(handle))
check(len(controls) >= 68, "Harness 控件不少于 68 项")

effect_dir = ROOT / "03_UIUX原型效果图与设计资产" / "关键效果图_V6.1"
effect_images = sorted(effect_dir.glob("*.png"))
check(len(effect_images) == 14, "V6.1 关键效果图正好 14 张")
try:
    from PIL import Image
    for image_path in effect_images + [ROOT / "03_UIUX原型效果图与设计资产" / "全套效果图总览_V6.1.png"]:
        with Image.open(image_path) as image:
            image.load()
            check(image.width >= 1000 and image.height >= 900, "图片完整：" + image_path.name)
except Exception as exc:
    errors.append("图片完整性检查失败：" + str(exc))

prototype_dir = ROOT / "03_UIUX原型效果图与设计资产" / "乐趣宝与乐趣生活可运行原型"
for file_name in ("app.js", "app-v6.1.js", "render-v6.1.mjs"):
    result = subprocess.run(["node", "--check", str(prototype_dir / file_name)], capture_output=True, text=True)
    check(result.returncode == 0, "JavaScript 语法正确：" + file_name)
prototype_text = (prototype_dir / "app-v6.1.js").read_text(encoding="utf-8")
for token in ("bao-intake", "bao-business", "bao-revenue", "bao-mobile-v61", "life-home-v61", "life-tabs-v61", "life-kit-v61"):
    check(token in prototype_text, "V6.1 原型视图存在：" + token)

source_ref = json.loads((ROOT / "07_Trae_Codex立即开发" / "Harness官方源码获取" / "SOURCE_REFERENCE.json").read_text(encoding="utf-8"))
check(source_ref.get("repository") == "https://github.com/deepseek-ai/deepseek-harness", "Harness 官方仓库正确")
check(source_ref.get("source_included") is False, "总包未错误宣称已内置 Harness 源码")

excluded_title_roots = [
    ROOT / "03_UIUX原型效果图与设计资产" / "Harness交互基线_仅验收控件",
    ROOT / "03_UIUX原型效果图与设计资产" / "设计规范",
]
for md_path in ROOT.glob("0[0-7]_*/**/*.md"):
    if any(parent in md_path.parents for parent in excluded_title_roots):
        continue
    lines = md_path.read_text(encoding="utf-8-sig").splitlines()
    first_heading = next((line[2:].strip() for line in lines if line.startswith("# ")), "")
    check(first_heading == md_path.stem, "文档标题匹配文件名：" + str(md_path.relative_to(ROOT)))

for json_path in ROOT.rglob("*.json"):
    json.loads(json_path.read_text(encoding="utf-8-sig"))
check(True, "JSON 文件全部可解析")
for jsonl_path in ROOT.rglob("*.jsonl"):
    for line in jsonl_path.read_text(encoding="utf-8-sig").splitlines():
        if line.strip():
            json.loads(line)
check(True, "JSONL 文件全部可解析")
for csv_path in ROOT.rglob("*.csv"):
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        list(csv.reader(handle))
check(True, "CSV 文件全部可解析")

manifest_entries = []
for file_path in sorted(path for path in ROOT.rglob("*") if path.is_file()):
    if file_path.name in {"MANIFEST.json", "SHA256SUMS"}:
        continue
    digest = hashlib.sha256(file_path.read_bytes()).hexdigest()
    manifest_entries.append({"path": file_path.relative_to(ROOT).as_posix(), "size": file_path.stat().st_size, "sha256": digest})
(ROOT / "MANIFEST.json").write_text(json.dumps({"package": ROOT.name, "files": manifest_entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "SHA256SUMS").write_text("\n".join(item["sha256"] + "  " + item["path"] for item in manifest_entries) + "\n", encoding="utf-8")
check(len(manifest_entries) >= 580, "总包文件不少于 580 个")

if errors:
    print("\n总包门禁失败：")
    for error in errors:
        print("-", error)
    sys.exit(1)

print("\nPASS: 乐趣宝与乐趣生活 V6.1 正式开发总包")
