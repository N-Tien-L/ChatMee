# CM-082 REPORT: landing + login (pilot bộ công cụ UI)

Branch `feat/CM-082-landing-login` (từ `chore/CM-081-ui-tooling`), 2 commit: `5bfedde` (landing, fx, PROVENANCE, PRODUCT.md, ticket, ảnh), `b1eb3e2` (login). Chưa push.

## 1. Hướng thiết kế
- Ý tưởng: landing cho thấy ChatMee chạy ở hai tầng cùng lúc. Bên trái là một phòng chat mẫu, bên phải là "wire log" với đúng các STOMP frame phía sau (`SEND /app/chat.sendMessage`, `MESSAGE /topic/rooms/{id}`, typing, presence), lấy từ `docs/design/websocket-protocol.md`.
- Khác mẫu SaaS: không có hero căn giữa + 3 thẻ tính năng. Phần năng lực là các hàng `dl` (một câu thường + destination thật). Chỉ dùng token sẵn có: teal là accent duy nhất, chart-2 cho presence, không gradient, không tím. Geist cho chữ, Geist Mono chỉ cho dữ liệu giao thức, Borel chỉ cho wordmark.
- Login dùng chung nền và khung với landing: wordmark, một card, GitHub là nút chính, một dòng trust. Bỏ nền WebGL.
- Impeccable concept-seed `f1c4b7d7` chia cấu trúc 5/7/3. Tôi chọn cấu trúc dẫn đầu (#5 "client | wire mirror"), theo hướng code trước, không tạo comp.

## 2. Component
| Tên | Nguồn | Đã sửa |
|---|---|---|
| AnimatedList | `@magicui/animated-list` → `components/fx/` | Thứ tự cũ trước mới sau; chạy một lần, không lặp; tĩnh khi reduced motion |
| BorderBeam | `@magicui/border-beam` → `components/fx/` | Màu từ token `--primary`; `aria-hidden`; không render khi reduced motion |
| usePrefersReducedMotion | tự viết (`fx/use-prefers-reduced-motion.ts`) | Dùng `useSyncExternalStore`, an toàn khi hydrate, có guard cho jsdom |

Đã loại:
- `@magicui/dot-pattern`: render hàng nghìn `<circle>` SVG chỉ để làm nền mờ.
- `@magicui/hyper-text`: ép chữ hoa và tách từng ký tự, làm sai tên destination và hỏng screen reader.
- `@magicui/animated-beam`: không view; tôi bỏ khỏi shortlist vì tia giữa hai pane cạnh nhau là gimmick và vỡ khi xếp chồng trên mobile.
- `dark-veil` (WebGL, không có reduced motion, không được sửa `components/ui`), `blur-text`/`flip-words`: animation trên h1 hại khả năng đọc, LCP và screen reader.

## 3. Dependency mới
Không có. `motion` đã có sẵn. CLI không đổi file tracked nào (đã kiểm tra `git status`/`git diff` sau khi `add`).

## 4. Kiểm tra theo AC
- **AC-1 PASS:** 1 `h1`, `header`/`main`/`footer`, 2 link "Sign in with GitHub" → `/login`; phím Tab thứ 4 tới CTA, có outline teal.
- **AC-2 PASS:** logic session/OAuth giữ nguyên. Cả 2 file test không sửa dòng nào, 222/222 test pass.
- **AC-3 PASS:** `scrollWidth == clientWidth` ở 360 trên cả hai trang. Đã chụp và kiểm tra 768 và 1440 (thêm 1024). Pane demo không bị cắt: đo cạnh trên item đầu so với pane.
- **AC-4 PASS:** với `reduce`, cả 5 item hiện ngay, không có beam, chấm typing `animation: none`. Beam, chấm typing và chấm presence đều có `aria-hidden`. Lưu ý: HTML từ server chỉ có item đầu, nên người dùng reduced motion thấy chớp 1 → 5 item khi hydrate.
- **AC-5 PASS:** 2 component trong `components/fx/`, có dòng trong `PROVENANCE.md`.
- **AC-6 PASS:** lint 0 lỗi (15 warning có sẵn, không có trong file của tôi), tsc OK, 222 test pass, build OK (`/` là trang static). Console: `/` 0 lỗi; `/login` chỉ có lỗi dự kiến `500 /api/v1/auth/me` (không chạy backend).
- Ảnh cuối trong `docs/plan/CM-082-screens/` (desktop + mobile, cả hai trang, đều dưới 300 KB). Ảnh tạm đã chuyển ra scratchpad.

## 5. Critique Impeccable (1 vòng, dual-agent A + B)
- Điểm heuristics: 21/32 (bỏ 7 và 10 vì n/a). Detector: 1 cảnh báo `bounce-easing` (chấm typing), 1 `ai-color-palette` trên beam. Tôi xếp cái sau là false positive: viền mảnh dùng token teal.
- Đã sửa:
  - Demo bị cắt ở 360/768: chiều cao theo breakpoint, body frame xuống dòng thay vì truncate.
  - Màu ở phần năng lực phá mã màu của demo: chuyển sang màu trung tính.
  - Cột trái trống: h2 dùng sticky.
  - Phần kết yếu: heading thành lời mời, stack thành dòng nhỏ.
  - CTA ở 1440 lệch xa đoạn văn: đặt ngay dưới đoạn văn.
  - Chấm typing đổi từ bounce sang pulse.
  - Tiêu đề pane mâu thuẫn với "không phải dữ liệu thật": đã sửa câu chữ.
  - Login thừa chữ: bỏ CardDescription. Skeleton khớp layout thật.
- Còn lại: link source vẫn là `#` (theo brief); không có dấu nối từng bước giữa chat và wire; login vẫn khá chung chung; cả hai nút cùng hiện "Redirecting..." (hành vi cũ, không đổi); lỗi login chỉ hiện bằng toast; nhãn link source chưa thống nhất; chưa có tên tác giả.

## 6. Đánh giá thẳng thắn
- **Impeccable:** concept-seed giúp thoát khỏi template, và critique hai agent tìm ra lỗi thật (cắt demo, lệch mã màu) mà tôi bỏ sót ở vòng đầu. Nhưng nó rất nặng: `new-work.md` khoảng 64 KB và quy trình mặc định cần phỏng vấn, trang quyết định, comp ảnh, DESIGN.md, finish reviewer. Với brief chặt phải bỏ bớt nhiều, và tôi đã bỏ qua phỏng vấn, trang quyết định và `surface-brief`. Hook chạy sau mỗi lần ghi nhưng hầu như không có tín hiệu.
- **shadcn registries:** search/view qua CLI ổn. Nhưng MCP chạy ở root repo nên không thấy `frontend/components.json` (danh sách registry rỗng). Cả hai component đều không xử lý reduced motion, nên luôn phải tự sửa.
- **Playwright MCP:** tốt cho đo DOM, reduced motion và focus. Hạn chế: chỉ ghi file trong repo (tạo `.playwright-mcp/`). Phép đo cắt đầu tiên của tôi sai với `justify-end`, phải đo lại cách khác.
- **Chi phí:** khoảng 230k token ở luồng chính và 140k ở hai subagent critique; khoảng 30 phút.
- **Tái sử dụng:** có, cho trang public/marketing, với quy trình đã rút gọn như trên. Với màn hình app thì quá nặng; chỉ nên dùng critique/audit.

## 7. Follow-ups (không tự làm)
- Light mode + theme switch cho toàn app.
- `DESIGN.md` qua `/impeccable document`.
- `components/background/LoginBackGround.tsx` không còn được dùng (và `dark-veil-background` chỉ được nó dùng); chưa xoá.
- URL repo thật thay cho `#`; thêm tên/GitHub tác giả cho người xem portfolio.
- Cấu hình MCP shadcn chạy với cwd `frontend/`.
- `next dev` tự sinh `frontend/AGENTS.md` và `frontend/CLAUDE.md` (untracked, chưa commit): cần chọn commit hay `.gitignore`.
- Focus ring toàn cục đang là `outline-ring/50` (độ mờ 50%); cân nhắc dùng 100%.
- Artifact Impeccable chưa commit: `.impeccable/hook.cache.json`, `.impeccable/questions/roll.json`.
