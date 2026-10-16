# Research: các bước xây dựng frontend từ đầu đến vận hành

Ngày truy cập nguồn: **2026-10-13**. Trạng thái: **ghi chú nghiên cứu và đề xuất tổng hợp**, chưa phải quy trình được duyệt, skill hay ticket triển khai.

## 1. Kết luận từ nguồn

Không có một danh sách bước tuyến tính duy nhất được mọi dự án frontend tuân theo. Design Council mô tả Discover → Define → Develop → Deliver với mở rộng lựa chọn, thu hẹp lựa chọn và lặp lại. GOV.UK phân biệt discovery, alpha, beta, live cho vòng đời dịch vụ. W3C nói hoạt động accessibility không nhất thiết tuần tự và nên được lặp lại. Những nguồn này bổ sung cho nhau, không phải cùng một tiêu chuẩn frontend. [Design Council](https://www.designcouncil.org.uk/resources/framework-for-innovation/), [GOV.UK discovery](https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works), [W3C planning](https://www.w3.org/WAI/planning-and-managing/).

GOV.UK là hướng dẫn dịch vụ chính phủ; lấy nguyên tắc kiểm chứng nhu cầu và rủi ro, không áp nguyên thời lượng, governance hoặc phong cách giao diện của họ cho ChatMee. MDN Curriculum là khung năng lực, không phải quy trình delivery. React Thinking in React giải thích tổ chức UI/state trong React, không thay thế nghiên cứu sản phẩm. [MDN phạm vi curriculum](https://developer.mozilla.org/en-US/curriculum/about-curriculum/), [React](https://react.dev/learn/thinking-in-react).

## 2. Các nhóm công việc cần có

Các bước dưới đây là **đề xuất tổng hợp cho agent**, dựa trên nguồn ở từng bước. Tên artifact, gate và mức độ chi tiết là đề xuất, không phải yêu cầu nguyên văn của nguồn. “Gate” nghĩa là bằng chứng đủ để đưa ra quyết định tiếp theo; thất bại có thể dẫn đến quay lại bước trước hoặc dừng ý tưởng.

### 1. Hiểu context và vấn đề

- **Đầu vào:** yêu cầu chủ dự án, tài liệu/code hiện có, mục tiêu kinh doanh, giới hạn nguồn lực.
- **Làm:** audit hiện trạng; xác định người dùng, việc họ cần hoàn thành, điều kiện sử dụng, ràng buộc và điều chưa biết. Research người dùng thực nếu có thể; nếu chỉ có brief hoặc giả định thì ghi đúng nguồn chứng cứ.
- **Đầu ra:** product brief ngắn, inventory hiện trạng, danh sách giả định/rủi ro, mục tiêu thành công.
- **Gate:** có vấn đề rõ, đối tượng rõ, scope sơ bộ và cách đánh giá thành công; chưa chọn thư viện vì “đẹp”.

GOV.UK discovery yêu cầu hiểu người dùng, mục tiêu của họ, bối cảnh và giới hạn trước khi cam kết xây. Chủ dự án thích thiết kế nào là input thẩm mỹ hợp lệ nhưng chưa phải bằng chứng rằng người dùng mục tiêu sử dụng được thiết kế đó. [Discovery](https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works).

### 2. Xác định features và tiêu chí chấp nhận

- **Đầu vào:** brief, nhu cầu và rủi ro đã nhận diện.
- **Làm:** chuyển nhu cầu thành capability/user story; phân MVP, sau MVP và ngoài scope; mô tả quyền, quy tắc, dữ liệu và chất lượng cần đạt.
- **Đầu ra:** feature map/backlog, acceptance criteria, tiêu chí responsive/accessibility/performance theo dự án.
- **Gate:** mỗi feature có actor, mục tiêu và kết quả quan sát được; biết feature nào thực sự thuộc lần triển khai này.

User story của GOV.UK nối người dùng, hành động và mục tiêu; acceptance criteria mô tả kết quả cần đạt. Không phải mọi dự án phải dùng đúng một mẫu câu. [Writing user stories](https://www.gov.uk/service-manual/agile-delivery/writing-user-stories).

### 3. Tổ chức nội dung, navigation, user flows và trạng thái

- **Đầu vào:** features, content/dữ liệu và vai trò người dùng.
- **Làm:** xác định cấu trúc thông tin, navigation, route; lập flow từ bắt đầu đến kết quả; viết nội dung/nhãn chủ chốt; chỉ ra trạng thái loading, empty, success, error, denied, expired, offline nếu liên quan.
- **Đầu ra:** sitemap/route map, user flow, screen/state inventory và draft nội dung.
- **Gate:** người dùng biết đi đâu, làm gì và nhận kết quả nào; các đường lỗi quan trọng có lối phục hồi.

Nguồn nhấn mạnh trải nghiệm từ đầu đến cuối và nội dung/transactions cùng phục vụ mục tiêu người dùng. Screen/state inventory là cách cụ thể hóa do ghi chú này đề xuất. [Designing good services](https://www.gov.uk/service-manual/design/introduction-designing-government-services), [GOV.UK Design](https://www.gov.uk/service-manual/design).

### 4. Kiểm tra khả thi và ràng buộc kỹ thuật sớm

- **Đầu vào:** flows, backend và stack hiện có.
- **Làm:** audit API/auth/realtime; kiểm tra dữ liệu, lỗi, quyền, pagination và lifecycle; thử rủi ro tích hợp lớn; phân biệt mock với contract thật.
- **Đầu ra:** contract sơ bộ, dependency map và feasibility spike nếu cần.
- **Gate:** các flow quan trọng có nguồn dữ liệu/contract khả thi hoặc blocker được ghi rõ.

Bước này chạy song song với thiết kế, không đợi UI đẹp xong mới xét backend. GOV.UK alpha khuyên thử giả định rủi ro cao, kể cả tích hợp công nghệ. OpenAPI mô tả HTTP API cho người và máy; không mô tả đầy đủ hành vi UX hoặc thay thế tài liệu protocol realtime. [Alpha](https://www.gov.uk/service-manual/agile-delivery/how-the-alpha-phase-works), [OpenAPI](https://spec.openapis.org/oas/v3.0.4.html).

### 5. Phát triển ý tưởng và prototype

- **Đầu vào:** brief, flow, nội dung, ràng buộc khả thi, reference.
- **Làm:** tạo lựa chọn khác nhau ở phần còn bất định; thử wireframe hoặc prototype đủ để kiểm chứng; đánh giá hierarchy, interaction, responsive và motion trên trình duyệt thật.
- **Đầu ra:** prototype, quyết định hướng thiết kế và kết quả thử với người dùng/chủ dự án.
- **Gate:** có cơ sở chọn hướng, những giả định quan trọng đã được thử; chưa cần polish mọi trang.

Design Council khuyến khích phát triển nhiều câu trả lời rồi thử và cải thiện. GOV.UK alpha cho phép prototype chỉ phần khó nhất, với mức độ đủ để thử; code prototype có thể bỏ đi. Số biến thể và số component khảo sát phải phụ thuộc mức bất định, không có quota phổ quát. [Double Diamond](https://www.designcouncil.org.uk/resources/framework-for-innovation/), [Alpha](https://www.gov.uk/service-manual/agile-delivery/how-the-alpha-phase-works).

### 6. Chốt nền tảng thị giác và component

- **Đầu vào:** hướng đã kiểm chứng, brand và component hiện có.
- **Làm:** chốt typography, color, spacing, density, layout, motion; chọn/tùy biến component và pattern; ghi provenance/license, accessibility và giới hạn.
- **Đầu ra:** tokens, component/pattern inventory, quy tắc dùng và một màn hình mẫu.
- **Gate:** các màn hình tiếp theo có thể dùng cùng ngôn ngữ thiết kế; component phù hợp nhiệm vụ thực tế.

Design system gồm styles, reusable components và patterns giải quyết nhiệm vụ; không chỉ một thư viện hiệu ứng. Thành phần đã thử ở context khác vẫn cần kiểm tra mức phù hợp với dự án. [GOV.UK Design System](https://design-system.service.gov.uk/), [Using the system](https://design-system.service.gov.uk/get-started/). MDN chỉ ra các nền tảng thiết kế như contrast, hierarchy, typography và whitespace. [Design for developers](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Design_for_developers).

### 7. Lập kiến trúc frontend và kế hoạch triển khai

- **Đầu vào:** features, contracts, prototype, design system, quy ước repo.
- **Làm:** xác định component boundary, state ownership, data flow, API adapter, routing, rendering và cache; chia vertical slice theo luồng hoàn chỉnh; đặt checks cho acceptance criteria.
- **Đầu ra:** implementation design, tickets có scope, dependencies và validation.
- **Gate:** biết phần nào UI thuần, phần nào state/data; contract và trách nhiệm rõ; không tạo architecture lớn hơn nhu cầu.

React mô tả việc chia component, xây phần tĩnh rồi xác định state tối thiểu, nơi sở hữu state và luồng dữ liệu. Đây là hướng dẫn React, không bắt mọi frontend theo đúng cấu trúc này. [Thinking in React](https://react.dev/learn/thinking-in-react).

### 8. Implement và tích hợp từng luồng

- **Đầu vào:** ticket và contract đã chốt.
- **Làm:** semantic UI, responsive layout, states, API/auth/realtime; cleanup lifecycle; tích hợp dữ liệu thật; review code và hành vi trong trình duyệt.
- **Đầu ra:** vertical slice chạy được, test phù hợp và preview.
- **Gate:** user hoàn thành flow, gồm trạng thái lỗi quan trọng; còn mock thì báo đúng mức hoàn thành.

GOV.UK beta chuyển từ thử ý tưởng sang xây dịch vụ và nhận feedback để cải thiện. Không thể suy ra production readiness từ một mock đẹp. [Beta](https://www.gov.uk/service-manual/agile-delivery/how-the-beta-phase-works).

### 9. Xác nhận chất lượng và nghiệm thu

- **Đầu vào:** slice tích hợp và acceptance criteria.
- **Làm:** lint/type/build/tests; E2E hành vi người dùng; kiểm tra keyboard/focus và assistive technology theo scope; browser/device; usability; visual và motion review; đo performance.
- **Đầu ra:** bằng chứng pass/fail, vấn đề còn lại, quyết định nghiệm thu.
- **Gate:** đạt tiêu chí đã đặt và checks của repo; không đánh đồng “build pass”, “đẹp”, “dễ dùng” và “accessible”.

Playwright khuyên test hành vi mà user nhìn/thao tác được, tests độc lập và locator/assertion bền vững. W3C nói không có tool nào tự xác định toàn bộ accessibility; cần đánh giá của người có hiểu biết, sớm và thường xuyên. [Playwright](https://playwright.dev/docs/best-practices), [W3C evaluation](https://www.w3.org/WAI/test-evaluate/).

Core Web Vitals hiện gồm LCP, INP, CLS; web.dev khuyên đánh giá dữ liệu field ở percentile 75 theo mobile/desktop. Đo local/lab giúp debug trước release, chưa chứng minh trải nghiệm của người dùng thật. Animation cần quan sát theo thời gian, interaction và reduced-motion; screenshot là một phần bằng chứng. Đánh giá “đẹp/thú vị” cần review chủ dự án hoặc người dùng, test không chứng minh được phẩm chất đó. [Web Vitals](https://web.dev/articles/vitals).

### 10. Release, bàn giao và vận hành

- **Đầu vào:** nghiệm thu, quyền deploy và môi trường đích.
- **Làm:** setup/run documentation, release checks, smoke test môi trường đích, kế hoạch rollback, monitoring và feedback.
- **Đầu ra:** bản phát hành có bằng chứng, runbook, metric và backlog cải tiến.
- **Gate:** xác nhận được flow thật ở môi trường phát hành; owner và vận hành rõ. Local implementation thành công và deploy thành công là hai trạng thái khác nhau.

GOV.UK live tiếp tục phát triển và đáp ứng nhu cầu người dùng, duy trì bền vững thay vì coi launch là hết công việc. [Live](https://www.gov.uk/service-manual/agile-delivery/how-the-live-phase-works).

## 3. Hoạt động xuyên suốt và kiểm soát chi phí

Accessibility, security/privacy, responsive, performance, content, testing và feedback là trách nhiệm xuyên suốt. Không dồn hết vào bước cuối. Riêng source W3C yêu cầu đánh giá sớm/đều đặn; MDN bao phủ semantic HTML, accessibility, responsive, performance và security như năng lực frontend. [W3C planning](https://www.w3.org/WAI/planning-and-managing/), [MDN Curriculum](https://developer.mozilla.org/en-US/curriculum/).

**Đề xuất vận hành tiết kiệm cho agent:**

- Điều chỉnh research/prototype theo rủi ro và bất định; nhiệm vụ nhỏ trong design system có sẵn không cần lặp toàn discovery.
- Reuse brief, contracts, patterns và quyết định đã xác nhận; chỉ tải context liên quan đến slice.
- Thử giả định đắt nhất trước khi polish nhiều màn hình; prototype có mục tiêu, không phải phiên bản miniature của toàn app.
- Gom các quyết định cần chủ dự án vào preview cụ thể; không hỏi lặp thông tin có sẵn.
- Giới hạn exploration/phần polish tùy ngân sách; không dùng giới hạn đó để bỏ lỗi chức năng hoặc checks bắt buộc.
- Ghi token, tool calls, thời gian làm/chờ, số vòng sửa và chất lượng nghiệm thu để đo tiết kiệm. Chưa có căn cứ từ các nguồn này để hứa một mức giảm chi phí token cụ thể.

Discovery khuyên thời lượng theo mục tiêu và hiểu biết sẵn có; alpha khuyên làm tối thiểu để thử rủi ro. Đây là cơ sở cho tính tỷ lệ, không phải bằng chứng rằng một budget cố định phù hợp mọi app. [Discovery](https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works), [Alpha](https://www.gov.uk/service-manual/agile-delivery/how-the-alpha-phase-works).

## 4. Áp dụng tại ChatMee

Tài liệu này không sửa Approved spec, code hay workflow hiện hành. Khi chuyển nghiên cứu thành skill/quy trình, phải giữ thứ tự thẩm quyền của repo: spec Approved → design/ADR khi liên quan → ticket → code → required verification. Việc chọn component theo `docs/design/ui-workflow.md` chỉ là một phần của các bước 5–6, không thay toàn bộ quy trình xây frontend.

Trong lần research này chưa tạo skill/tool, chưa implement frontend, chưa chạy tests và chưa deploy. Cần chủ dự án cùng làm rõ mỗi bước và gate trước khi đóng gói thành quy trình agent.
