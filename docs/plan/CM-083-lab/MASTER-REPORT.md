# CM-083: Báo cáo master

Ngày 2026-10-13. Nhánh `lab/frontend-eval` @ `d405495` (đã merge 4 nhánh `lab/eval-*`). Báo cáo chỉ dùng code, không có mapping.

## 1. Tổng quan
- 4 worker chạy song song, cùng model Opus 5.5, effort medium, auto mode, mỗi worker một worktree riêng. Gửi prompt lúc 12:15.
- p6 là bản tham chiếu, không có worker chạy. Nó chỉ có mặt trong phần build, JS và ảnh so sánh.
- Merge: owner tự chạy 4 lệnh `git merge --no-ff` vì classifier chặn master merge. Không có conflict. Không code nào sửa file ngoài thư mục của mình, kể cả `package.json`.

## 2. Build và kiểm tra trên `lab/frontend-eval` sau merge
| Lệnh | Kết quả |
|---|---|
| `npm run lint` | 0 lỗi, 15 warning. Cả 15 warning nằm ngoài code lab: `npx eslint app/lab components/lab` sạch. |
| `npx tsc --noEmit` | Lần đầu lỗi ở `.next/dev/types` (type route cũ do dev server `:3000` sinh ra). Chạy lại sau `npm run build` thì 0 lỗi; không có lỗi nào ở source. |
| `npm test` | 37 file, 222 test pass |
| `npm run build` | Pass. Mọi route `/lab/<code>` và `/lab/<code>/login` đều prerender tĩnh (○). |

Ảnh so sánh: 30 ảnh trong `_compare/` (5 code × 2 trang × 360x800, 768x1024, 1440x900), chụp từ dev server `:3000` sẵn có của pane run-frontend (xem mục 6). Kết quả lúc chụp:
- 0 lỗi console, 0 pageerror.
- Không trang nào bị cuộn ngang ở cả 3 kích thước.

## 3. Theo từng code
JS client lấy từ build production, gzip -9.
- "Riêng route": các chunk không có trong trang `/lab` gốc (176.9 KB gzip).
- Thời gian: tính từ lúc nhận prompt đến lúc in `LAB-DONE`.
- Token: tổng của phiên chính cộng subagent; "cache đọc" là lượng token đọc từ prompt cache.

| Code | Commit | Dep mới | JS riêng route (landing / login) | Thời gian | Tool call | Token output | Cache đọc / ghi |
|---|---|---|---|---|---|---|---|
| a9 | `08ed9b9` | không | 21.5 / 20.1 KB | ~16 phút | 111 | 57k | 10.8M / 150k |
| d9 | `a9539fb` | không | 48.6 / 0 KB | ~10 phút | 96 | 36k | 4.4M / 88k |
| k2 | `e8f2c28` | không | 5.6 / 0 KB | ~131 phút (xem ghi chú) | 125 + 30 subagent | 93.6k | 22.7M / 346k |
| r7 | `1d7bbd4` | không | 63.3 / 19.1 KB | ~21 phút | 73 | 48k | 7.0M / 148k |
| p6 | (setup) | không | 56.4 / 53.4 KB | không chạy | - | - | - |

Ghi chú về quota và thời gian:
- Quota 5h tăng từ 41% lên 88% trong khoảng 12:15-12:55, rồi reset trong lúc k2 đang chạy.
- Phần lớn 131 phút của k2 là chờ owner ở các điểm quyết định, gồm ~50 phút chờ live mode. Code này vượt time box 90 phút khoảng 40 phút. Trong REPORT, k2 tự ghi là bỏ bước re-verify của reviewer vì hết giờ.

## 4. Đối chiếu LOG.md với transcript
Mỗi code: đọc LOG.md, rồi so từng mục ghi là "đã xem / đã render / đã loại" với tool call thật trong file `.jsonl`.

- **a9**: Các mục ghi "source viewed" đều có lệnh view thật. Với 2 mục chỉ đọc phần đầu file, LOG có ghi rõ "first part". Sai lệch:
  - Ghi dev log ra `C:/Users/Tien/Workspace/Personal/a9-dev.log`, tức ngoài worktree. File đã bị xóa. REPORT/pane có nhắc nhưng LOG không ghi.
- **d9**: LOG khớp với tool call. Không thấy ghi file ngoài worktree. Không có sai lệch.
- **r7**: 11/11 mục ghi "đã xem demo" có URL đã mở thật. Có 11 file view lưu lại; 6 mục ghi "đã cài" khớp với nội dung `fx/`. Có 34 ảnh candidate. Sai lệch:
  - Cũng ghi dev log ngoài worktree (`r7-dev.log`) rồi xóa. Có tự khai trong pane.
- **k2**: Các điểm quyết định của owner (6 điểm) khớp với các lần gọi AskUserQuestion, serve-question và live-poll. Sai lệch:
  - LOG nói registry "not configured in components.json" nên không tìm được. Thực tế worker chỉ thử qua MCP (chạy từ thư mục gốc repo, không thấy `frontend/components.json`) và không thử CLI. Lý do ghi trong LOG vì vậy không chính xác.
  - Sửa `frontend/.gitignore`, file nằm ngoài vùng được ghi, do live mode tự thêm. Thay đổi này chưa commit, đang chờ owner quyết.
  - Có tạo `frontend/DESIGN.md` tạm trong live mode, sau đó đã xóa. LOG có ghi.
  - `DESIGN.md` và `design.json` trong thư mục k2 đã cũ, không còn khớp bản cuối. LOG có ghi.
  - Không thấy lượt critique riêng: chỉ có `detect` cộng một lượt finish review.

## 5. Sự cố phía master
- Classifier chặn `git merge` (Modify Shared Resources). Owner đã tự merge.
- Một lệnh có dính `git checkout fa3ba75` ngoài ý muốn làm HEAD bị detached. Đã quay lại `lab/frontend-eval` ngay; không mất gì vì tree sạch.
- Không khởi động được dev server riêng trên `:3105`: Next chỉ cho phép một dev server cho mỗi thư mục. Vì vậy dùng server `:3000` sẵn có, không dừng server đó.

## 6. File chưa track và worktree (không xóa gì; owner tự dọn)
- Checkout chính có thêm, do master tạo: `.playwright-mcp/`.
- Chưa commit trong checkout chính: `docs/plan/CM-083-lab/_compare/` và `MASTER-REPORT.md`.
- Worktree `C:/Users/Tien/Workspace/Personal/ChatMee-lab-1` .. `-4`, trên các nhánh `lab/eval-*`. File trong đó:
  - Cả 4: `.claude/agents/`, `.claude/skills/playwright-tester/`.
  - `.playwright-mcp/`: lab-2, lab-3, lab-4.
  - `frontend/AGENTS.md` và `frontend/CLAUDE.md` do next dev sinh ra: lab-2, lab-3, lab-4.
  - Riêng lab-2: `.impeccable/`, `frontend/.impeccable/` và thay đổi `frontend/.gitignore` chưa commit.

## 7. Bước tiếp theo
Chấm mù phần 1 theo `docs/plan/CM-083-scorecard.md`: mở `/lab` trên dev server rồi xem từng code trực tiếp (có chuyển động). Có thể dùng ảnh trong `_compare/` để đối chiếu. Sau phần 1 mới mở `.lab-key.md` để làm phần 2.
