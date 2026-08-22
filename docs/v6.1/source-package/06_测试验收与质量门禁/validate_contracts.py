#!/usr/bin/env python3
"""乐趣宝与乐趣生活 V6.1 开发契约静态门禁。"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "05_数据API事件权限与安全"
PAGES = ROOT / "02_完整PRD页面树与状态机"
UI = ROOT / "03_UIUX原型效果图与设计资产"

PATHS = {
    "schema": DATA / "database" / "schema.sql",
    "migration": DATA / "database" / "migrations" / "0002_v6_1_永久收益权与AI对话建档.sql",
    "openapi": DATA / "openapi" / "openapi.yaml",
    "envelope": DATA / "events" / "event-envelope.schema.json",
    "events": DATA / "events" / "领域事件目录.csv",
    "tracking": DATA / "events" / "产品埋点目录.csv",
    "rbac": DATA / "RBAC矩阵.csv",
    "permissions": DATA / "权限代码与控制要求.csv",
    "page_tree": PAGES / "页面树与页面契约" / "页面树.csv",
    "page_stats": PAGES / "页面树与页面契约" / "页面树统计.json",
    "intake_state": PAGES / "AI对话建档状态机.md",
    "revenue_state": PAGES / "收益结算状态机.md",
    "tests_base": HERE / "测试验收清单.csv",
    "tests_v61": HERE / "V6.1_P0测试清单.csv",
    "stop": HERE / "停止发布条件.md",
    "sprite": UI / "生活分类立体图标精灵.png",
    "prototype_js": UI / "乐趣宝与乐趣生活可运行原型" / "app-v6.1.js",
    "prototype_css": UI / "乐趣宝与乐趣生活可运行原型" / "styles-v6.1.css",
}

REQUIRED_DOCS = [
    ROOT / "00_先读我" / "唯一开发基线.md",
    ROOT / "01_产品商业与收益规则" / "商户订阅永久收益分配规则.md",
    ROOT / "01_产品商业与收益规则" / "成本目录与月结规则.md",
    ROOT / "01_产品商业与收益规则" / "算力包收益分配规则.md",
    ROOT / "01_产品商业与收益规则" / "代金券单公司结算规则.md",
    PAGES / "模块PRD" / "AI对话式商家建档产品需求说明书.md",
    PAGES / "模块PRD" / "商务中心与永久收益产品需求说明书.md",
    ROOT / "04_AI对话建档客服GEO与插件" / "企业微信对话入口方案.md",
    ROOT / "07_Trae_Codex立即开发" / "开发唯一主指令.md",
]

REQUIRED_STATES = {
    "intake": {"COLLECTING", "EXTRACTING", "WAITING_ANSWERS", "WAITING_CONFIRMATION", "CONFIRMED", "PUBLISHING", "COMPLETED", "FAILED", "CANCELLED"},
    "revenue": {"ESTIMATED", "WAITING_COST", "REVIEW", "LOCKED", "PAYABLE", "PAID", "REVERSED"},
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    errors: list[str] = []
    required = list(PATHS.values()) + REQUIRED_DOCS
    for path in required:
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"missing or empty: {path.relative_to(ROOT)}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    # 只扫描 00-07 当前基线，80/81/82 为历史原件。
    active_texts: list[str] = []
    active_prefixes = tuple(f"0{i}_" for i in range(8))
    for path in ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".csv", ".sql", ".yaml", ".json", ".js", ".css"}:
            if path.relative_to(ROOT).parts[0].startswith(active_prefixes):
                active_texts.append(path.read_text(encoding="utf-8", errors="replace"))
    active_text = "\n".join(active_texts)
    for marker in ("TODO", "TBD", "待开发补充"):
        if marker in active_text:
            errors.append(f"unresolved placeholder in active baseline: {marker}")

    schema = PATHS["schema"].read_text(encoding="utf-8")
    migration = PATHS["migration"].read_text(encoding="utf-8")
    created_tables = set(re.findall(r"CREATE TABLE\s+([a-z_]+)", schema, flags=re.IGNORECASE))
    v61_tables = {
        "revenue_beneficiaries", "merchant_revenue_right_groups", "merchant_revenue_right_holders",
        "revenue_share_policies", "revenue_share_policy_splits", "direct_cost_catalog", "direct_cost_entries",
        "revenue_distribution_statements", "revenue_distribution_allocations", "revenue_distribution_entries",
        "revenue_right_transfers", "merchant_intake_sessions", "merchant_intake_assets",
        "merchant_intake_field_candidates", "merchant_intake_confirmations",
    }
    core_tables = {"tenants", "stores", "orders", "payment_intents", "refunds", "ledger_transactions", "ledger_entries", "delivery_projects", "mini_program_releases", "conversations"}
    missing = sorted((v61_tables | core_tables) - created_tables)
    if missing:
        errors.append(f"schema missing tables: {', '.join(missing)}")
    if len(created_tables) < 73:
        errors.append(f"schema table count below V6.1 baseline: {len(created_tables)}")
    for needle in ("ENABLE ROW LEVEL SECURITY", "app.current_tenant_id()", "merchant_revenue_right_total_check", "revenue_policy_split_total_check", "ledger_entries_balance_trigger", "merchant_payment_account_ref"):
        if needle not in schema:
            errors.append(f"schema missing control: {needle}")
    if re.search(r"\b(real|double precision|money)\b", schema, flags=re.IGNORECASE):
        errors.append("financial schema contains unsafe numeric type")
    for table in v61_tables:
        if f"CREATE TABLE {table}" not in migration:
            errors.append(f"V6.1 migration missing table: {table}")

    for group, key in (("intake", "intake_state"), ("revenue", "revenue_state")):
        doc = PATHS[key].read_text(encoding="utf-8")
        for state in REQUIRED_STATES[group]:
            if state not in doc or state not in schema:
                errors.append(f"state not aligned for {group}: {state}")

    openapi = PATHS["openapi"].read_text(encoding="utf-8")
    for needle in (
        "openapi: 3.1.0", "Idempotency-Key", "If-Match-Version", "x-required-permission",
        "/v1/merchant-intake/sessions", "/v1/merchant-intake/sessions/{session_id}/assets",
        "/v1/merchant-intake/sessions/{session_id}/confirmations", "/v1/business/revenue-rights",
        "/v1/business/revenue-rights/{right_id}/transfers", "/v1/business/distribution-statements",
        "/v1/platform/distribution-statements/{statement_id}/commands/lock", "/v1/webhooks/wecom/intake",
        "/v1/customer-service/conversations", "/v1/webhooks/payments/{provider}",
    ):
        if needle not in openapi:
            errors.append(f"OpenAPI missing: {needle}")
    try:
        import yaml  # type: ignore
        parsed = yaml.safe_load(openapi)
        if not isinstance(parsed, dict) or len(parsed.get("paths", {})) < 37:
            errors.append("OpenAPI parse or path count below V6.1 baseline")
    except ImportError:
        print("WARN: PyYAML unavailable; semantic YAML parsing skipped")
    except Exception as exc:
        errors.append(f"OpenAPI YAML parse failed: {exc}")

    try:
        envelope = json.loads(PATHS["envelope"].read_text(encoding="utf-8"))
        fields = {"event_id", "event_name", "tenant_id", "aggregate_version", "trace_id", "payload"}
        if not fields.issubset(set(envelope.get("required", []))):
            errors.append("event envelope lacks required fields")
    except json.JSONDecodeError as exc:
        errors.append(f"event envelope JSON invalid: {exc}")

    events = read_csv(PATHS["events"])
    event_names = [row.get("event_name", "") for row in events]
    pattern = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[1-9][0-9]*$")
    if len(events) < 46 or len(event_names) != len(set(event_names)):
        errors.append(f"domain event count or uniqueness invalid: {len(events)}")
    invalid_events = [name for name in event_names if not pattern.fullmatch(name)]
    if invalid_events:
        errors.append(f"invalid event names: {', '.join(invalid_events)}")
    for event in ("merchant.intake_committed.v1", "revenue_right.activated.v1", "distribution.statement_locked.v1", "distribution.reversed.v1"):
        if event not in event_names:
            errors.append(f"missing V6.1 event: {event}")
    tracking = read_csv(PATHS["tracking"])
    tracking_names = [row.get("event_name", "") for row in tracking]
    if len(tracking) < 38 or len(tracking_names) != len(set(tracking_names)):
        errors.append(f"tracking count or uniqueness invalid: {len(tracking)}")

    rbac = read_csv(PATHS["rbac"])
    roles = {row.get("role_code", "") for row in rbac}
    required_roles = {"MERCHANT_OWNER", "STORE_MANAGER", "CUSTOMER_SERVICE", "FINANCE", "PLUGIN_RUNTIME", "BUSINESS_DEVELOPER", "INVESTMENT_OPERATOR", "REGIONAL_PROVIDER", "PLATFORM_FINANCE", "PLATFORM_OPS"}
    for role in sorted(required_roles - roles):
        errors.append(f"RBAC missing role: {role}")
    permission_rows = read_csv(PATHS["permissions"])
    declared = {row.get("permission_code", "") for row in permission_rows}
    matrix_permissions = set(rbac[0].keys()) - {"role_code", "role_name", "scope"} if rbac else set()
    if matrix_permissions - declared:
        errors.append(f"RBAC permissions lack docs: {', '.join(sorted(matrix_permissions - declared))}")
    for permission in ("merchant.intake.confirm", "revenue_right.transfer_approve", "distribution.lock", "distribution.reverse", "cost_catalog.manage"):
        if permission not in declared:
            errors.append(f"missing V6.1 permission: {permission}")

    pages = read_csv(PATHS["page_tree"])
    stats = json.loads(PATHS["page_stats"].read_text(encoding="utf-8"))
    leaves = [row for row in pages if row.get("is_leaf", "").lower() == "true"]
    if (len(pages), len(leaves), int(stats.get("max_level", 0))) != (307, 197, 6):
        errors.append(f"page tree differs from baseline: {len(pages)}/{len(leaves)}/{stats.get('max_level')}")
    eight_states = {"默认", "加载中", "空数据", "局部错误", "无权限", "停用", "成功", "可恢复失败"}
    for row in leaves:
        if not eight_states.issubset(set(row.get("states", "").split(";"))):
            errors.append(f"leaf page lacks eight states: {row.get('page_id')}")
            break
        if not row.get("route") or not row.get("acceptance"):
            errors.append(f"leaf page lacks route or acceptance: {row.get('page_id')}")
            break

    tests = read_csv(PATHS["tests_base"]) + read_csv(PATHS["tests_v61"])
    test_ids = [row.get("test_id", "") for row in tests]
    if len(tests) < 140 or len(test_ids) != len(set(test_ids)):
        errors.append(f"test count or uniqueness invalid: {len(tests)}")
    prefixes = {test_id.split("-")[0] for test_id in test_ids}
    required_prefixes = {"TEN", "RBAC", "DEL", "MP", "CS", "PAY", "REF", "VER", "REW", "PLG", "EVT", "MIG", "PRI", "SEC", "DR", "INT", "RGT", "CST", "DST", "CMP", "VCH", "UI", "API"}
    if required_prefixes - prefixes:
        errors.append(f"tests missing domains: {', '.join(sorted(required_prefixes - prefixes))}")

    screenshots = sorted((UI / "关键效果图_V6.1").glob("*.png"))
    if len(screenshots) != 14:
        errors.append(f"V6.1 screenshot count must be 14, got {len(screenshots)}")
    if PATHS["sprite"].stat().st_size < 1_000_000:
        errors.append("3D category sprite appears incomplete")
    prototype = PATHS["prototype_js"].read_text(encoding="utf-8")
    for route in ("bao-intake", "bao-business", "bao-revenue", "bao-mobile-v61", "life-home-v61", "life-tabs-v61", "life-kit-v61"):
        if route not in prototype:
            errors.append(f"prototype route missing: {route}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"FAILED: {len(errors)} contract error(s)")
        return 1

    print(f"PASS: {len(required)} required artifacts")
    print(f"PASS: {len(created_tables)} SQL tables and V6.1 migration")
    print(f"PASS: {len(events)} domain events and {len(tracking)} tracking events")
    print(f"PASS: {len(rbac)} roles and {len(declared)} permission controls")
    print(f"PASS: {len(pages)} page nodes, {len(leaves)} leaf pages, eight states each")
    print(f"PASS: {len(tests)} acceptance tests")
    print(f"PASS: {len(screenshots)} rendered effect images and 3D icon sprite")
    return 0


if __name__ == "__main__":
    sys.exit(main())
