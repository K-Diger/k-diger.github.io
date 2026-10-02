# frozen_string_literal: true

# 이전 테마(Chirpy)의 페이지네이션 주소 /page2/ ... 를 홈으로 돌려보낸다.
# 검색엔진과 외부 링크에 남아 있는 주소가 404 가 되지 않게 하기 위한 것이다.
module LegacyRedirects
  class Generator < Jekyll::Generator
    safe true
    priority :low

    PAGES = 10

    def generate(site)
      target = "#{site.baseurl}/"
      (2..PAGES).each do |n|
        page = Jekyll::PageWithoutAFile.new(site, site.source, "page#{n}", "index.html")
        page.data["layout"] = nil
        page.data["sitemap"] = false
        page.content = <<~HTML
          <!doctype html><html lang="ko"><head><meta charset="utf-8">
          <title>이동 중</title><meta name="robots" content="noindex">
          <link rel="canonical" href="#{site.config['url']}#{target}">
          <meta http-equiv="refresh" content="0; url=#{target}"></head>
          <body><a href="#{target}">글 목록으로 이동</a></body></html>
        HTML
        site.pages << page
      end
    end
  end
end
