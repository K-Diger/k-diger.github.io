# k-diger.github.io

김도현의 기술 블로그. Jekyll 위에 직접 만든 테마로 돌아간다(2026-10 이전에는 Chirpy).

## 로컬 실행

```bash
bundle install
bundle exec jekyll serve
```

푸시하면 `.github/workflows/pages-deploy.yml` 이 빌드해 GitHub Pages 로 배포한다. 프런트엔드 빌드 단계는 없다.

## 구조

| 경로 | 내용 |
|---|---|
| `_posts/` | 글. 파일명 `YYYY-MM-DD-slug.md`, 주소는 `/posts/slug/` |
| `_layouts/`, `_includes/` | 페이지 틀(home, post, page, archive) |
| `_sass/` | 디자인 토큰(`_tokens.scss`)과 본문 타이포그래피(`_prose.scss`) 등 |
| `assets/js/site.js` | 검색, 목차, 코드 복사, Mermaid/MathJax 지연 로드, 홈 그림 |
| `assets/js/data/search.json` | 검색 색인(빌드 때 생성) |
| `_plugins/` | 수정일(git 기준), 옛 `/pageN/` 주소 리다이렉트 |
| `sw.min.js`, `app.min.js` | 옛 테마가 등록한 서비스 워커를 해제하는 용도 |

## 글 작성 규칙

- 분류는 `categories: [1단계, 2단계]`. 1단계는 Kubernetes, Observability, Middleware, Database, Backend, Architecture, AI, CS, DevOps 중 하나
- 태그는 공식 표기(`Kubernetes`, `OpenTelemetry`, `eBPF`)로 3~6개
- 본문에 Helm/Go 템플릿의 `{{ }}` 가 있으면 front matter 에 `render_with_liquid: false`
- Mermaid 는 ```` ```mermaid ```` 코드 블록, 수식은 `math: true` 후 `$...$`, `$$...$$`
