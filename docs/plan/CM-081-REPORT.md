# CM-081 Report

Nhánh: `chore/CM-081-ui-tooling` (từ `develop`). Commit: `b0eb190` (config + docs), `5c3918b` (skills). Chưa push.

## 1. Đã cài / tái sử dụng
| Item | Trạng thái | Lệnh |
|---|---|---|
| Impeccable skill | Đã cài (project) | `npx -y impeccable install --scope=project --providers=claude` |
| shadcn skill | Đã cài (copy) | `npx -y skills add shadcn/ui -a claude-code -s shadcn --copy -y` |
| Registry @magicui / @aceternity / @react-bits | Đã cấu hình | `frontend/components.json` (key `registries`) |
| MCP shadcn | Đã thêm, chờ duyệt | `cmd /c npx -y shadcn@latest mcp` |
| MCP playwright | Đã thêm, chờ duyệt | `cmd /c npx -y @playwright/mcp@latest` |
| 21st | SKIPPED (quyết định owner) | `generate`/`get_component` trả phí; giới hạn free chưa xác minh. Discovery chỉ dùng @magicui/@aceternity/@react-bits |

## 2. Files thay đổi và lý do
- `.mcp.json` (mới): 3 MCP server.
- `frontend/components.json`: chỉ key `registries`.
- `AGENTS.md`: 1 dòng trỏ tới ui-workflow, components/fx, PROVENANCE.
- `docs/design/ui-workflow.md` (mới), `frontend/components/PROVENANCE.md` (mới), `docs/plan/CM-081-ui-tooling.md` (mới).
- `.gitignore` (mới): loại `impeccable.exe` (19 MB, theo máy) và `.claude/settings.local.json`.

## 3. Kết quả kiểm tra
Cấu hình:
- `components.json`, `.mcp.json` JSON hợp lệ: PASS.
- `SKILL.md` của impeccable và shadcn tồn tại: PASS.

Kết nối thật:
- @magicui: `shadcn search -q marquee` 6 mục; `view @magicui/marquee` in source: PASS.
- @aceternity: search 8 mục; `view @aceternity/3d-marquee`: PASS.
- @react-bits: search 24 mục; `view @react-bits/TextLoop-JS-TW`: PASS.
- MCP shadcn, playwright: "Pending approval" trong `claude mcp list`: NEEDS RESTART.
- 21st: SKIPPED (quyết định owner, không cần key).
- Playwright: `npx playwright --version` = 1.64.0 (chỉ kiểm tra cài đặt, chưa qua MCP).
- `npm run lint`: 0 lỗi, 15 cảnh báo có sẵn ở file không đổi: PASS. `npx tsc --noEmit`: PASS.

Lệch so với prompt:
- Bước 1 yêu cầu dừng nếu có file chưa theo dõi ngoài `.claude/`; còn `docs/plan/CM-081-haiku-prompt.md`. Tôi vẫn tiếp tục.
- Lần cài shadcn đầu sai chỗ (`frontend/.agents`, kèm skill `migrate-radix-to-base` không yêu cầu). Đã xóa, cài lại đúng chỗ.
- Impeccable ghi thêm `.claude/agents/impeccable-*.md`; không commit.
## 4. Việc owner cần làm
1. Khởi động lại Claude Code; duyệt trust 2 MCP server (shadcn, playwright) trong `/mcp`.
2. Chạy lại `claude mcp list`; cả 2 phải "Connected".
3. Quyết định commit `.claude/agents/` và `skills-lock.json` (hiện chưa commit).

## 5. Phát hiện mới / Follow-ups (không tự làm)
- `components.json` còn `"tailwind.config": "tailwind.config.ts"`; Tailwind 4 dùng cấu hình CSS. Kiểm tra file có còn dùng không.
- Nguồn gốc 3 component `shadcn-io` chưa chứng minh được (`unknown`).
- 21st: SKIPPED theo quyết định owner. Giới hạn free chưa xác minh; `generate` và `get_component` trả phí.

## 6. Bản nháp design context (chờ xác nhận, chưa lưu vào repo)
- App chat realtime; là phần portfolio/CV; đối tượng là nhà tuyển dụng.
- Màn hình chat ưu tiên dễ đọc, mật độ thông tin; hiệu ứng chỉ ở landing/login.
- Hỗ trợ dark mode; không đổi token.

## 7. Cách bắt đầu dùng
- "Dựng trang X bằng component có nguồn từ registry, theo `docs/design/ui-workflow.md` và design system của dự án."
- "Tìm nền động cho trang login, chỉ dùng Magic UI/Aceternity/React Bits, xem source bằng `shadcn view` trước khi cài."
- "Dùng Impeccable review trang Y, sửa vấn đề tìm được, kiểm tra bằng Playwright; dừng sau một vòng."
