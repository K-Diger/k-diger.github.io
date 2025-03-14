---

title: 형태소 분석기를 활용한 키워드 추출
date: 2023-11-21
categories: [SHORTS]
tags: [SHORTS]
layout: post
toc: true
math: true
mermaid: true

---

# 1. 키워드 추출에 관한 기술 조사

- [Jsoup](https://jsoup.org/)
- [Lucene](https://mvnrepository.com/artifact/org.apache.lucene/lucene-core)
- [Lucene Korean Analyze](https://lucene.apache.org/core/7_4_0/analyzers-nori/org/apache/lucene/analysis/ko/KoreanAnalyzer.html)
- [Komoran](https://docs.komoran.kr/)

---

### 후보 1. Lucene Korean Analyzer

-[Lucene Nori Korean Analyze](https://m.blog.naver.com/websearch/221795964259)

1. Jsoup을 활용하여 뉴스 크롤링
2. News 저장
3. Lucene의 Analyzer를 활용하여 키워드 추출
4. NewsCard 저장

[Lucene Analyzer에 대한 조사](https://k-diger.github.io/posts/ApacheLucene/)

---

### 후보 2. Komoran

1. Jsoup을 활용하여 뉴스 크롤링
2. News 저장
3. Komoran의 한국어 형태소 분석기를 활용하여 키워드 추출
4. NewsCard 저장

---

# 2. 두 가지 기술 스택을 바탕으로 키워드 추출 로직 구현

## Lucene Analyzer

```kotlin
@Component
@Qualifier("LuceneAnalyzerKeywordExtractor")
class LuceneAnalyzerKeywordExtractor : KeywordExtractor {

    override fun extractKeyword(title: String, content: String): String {
        val titleFrequencies = calculateWordFrequencies(title, TITLE_WEIGHT)
        val contentFrequencies = calculateWordFrequencies(content, CONTENT_WEIGHT)
        val wordFrequencies = titleFrequencies.toMutableMap()

        contentFrequencies.forEach { (key, value) ->
            wordFrequencies[key] = wordFrequencies.getOrDefault(key, DEFAULT_FREQUENCY) + value
        }

        return formatResult(wordFrequencies)
    }

    private fun calculateWordFrequencies(text: String, weight: Double): Map<String, Int> {
        val wordFrequencies = mutableMapOf<String, Int>()
        val tokenStream = createTokenStream(text)
        tokenStream.use { token ->
            token.reset()
            while (token.incrementToken()) {
                val term = token.getAttribute(CharTermAttribute::class.java).toString()
                if (term !in stopWords && term.length > 1) {
                    val frequency = wordFrequencies.getOrDefault(term, DEFAULT_FREQUENCY)
                    wordFrequencies[term] = frequency + weight.toInt()
                }
            }
            token.end()
        }
        return wordFrequencies
    }

    private fun createTokenStream(text: String): TokenStream {
        val reader = StringReader(text)
        return luceneKoreanAnalyzer.tokenStream(TOKEN_STREAM_FIELD_NAME_TYPE, reader)
    }

    private fun formatResult(wordFrequencies: Map<String, Int>): String {
        val sortedKeywords = wordFrequencies.entries.sortedByDescending { it.value }
        val topKeywords = sortedKeywords.take(KEYWORD_COUNT).map { it.key }
        return topKeywords.joinToString(", ")
    }

    companion object {
        private const val KEYWORD_COUNT = 5
        private const val TITLE_WEIGHT = 1.5
        private const val CONTENT_WEIGHT = 1.0
        private const val DEFAULT_FREQUENCY = 0
        private const val TOKEN_STREAM_FIELD_NAME_TYPE = "text"

        private val luceneKoreanAnalyzer = object : Analyzer() {
            override fun createComponents(fieldName: String?): TokenStreamComponents {
                val koreanTokenizer = KoreanTokenizer(
                    KoreanTokenizer.DEFAULT_TOKEN_ATTRIBUTE_FACTORY,
                    null,
                    DecompoundMode.NONE,
                    true
                )
                return TokenStreamComponents(koreanTokenizer)
            }
        }
    }
}
```

위 코드에는 기사 제목과 기사 본문에 대한 가중치를 추가해줬다. 뉴스 기사는 제목에 핵심이 들어있기 때문에 제목으로부터 추출한 키워드의 가중치를 높여 조금 더 핵심을 담은 키워드 요약 기능으로 사용자 경험을 개선하고자 했다.

---

### Komoran

```kotlin
@Component
@Deprecated("Replaces morphological analysis with Komoran Library.")
@Qualifier("KomoranKeywordExtractor")
class KomoranKeywordExtractor : KeywordExtractor {

    override fun extractKeyword(title: String, content: String): String {
        val keywordCount = 5
        val komoran = Komoran(DEFAULT_MODEL.FULL)
        val nouns = komoran.analyze(content).nouns
        val nounsCountingMap = HashMap<String, Int>()
        val nounsSet = HashSet(nouns)

        nounsSet.map {
            val frequency = Collections.frequency(nouns, it)
            nounsCountingMap[it] = frequency
        }

        val hotKeyword = nounsCountingMap.entries
            .sortedByDescending { it.value }
            .take(keywordCount).map { it.key }

        return hotKeyword.joinToString(", ")
            .replace("[", "")
            .replace("]", "")
    }

}
```

---

## 3. 둘 중 어떤걸 선택했는가?

Lucene Analyzer를 사용하기로했다.

```kotlin
val koreanTokenizer = KoreanTokenizer(
    KoreanTokenizer.DEFAULT_TOKEN_ATTRIBUTE_FACTORY,
    null,
    DecompoundMode.NONE,
    true
)
```

위와 같이 KoreanTokenizer를 생성할 때 `DecompoundMode.NONE`이라는 옵션을 줄 수 있는데 이 옵션은 복합명사를 분리하지 않는 옵션이다. 뉴스 기사에는 복합명사로 이루어진 구문이 다수 있기 때문에 이 옵션을 위해 Lucene을 채택했다.

이와 달리 `DISCARD`옵션은 복합명사로 분리하고 원본 데이터는 삭제한다.

`MIXED`옵션은 복합명사로 분리하고 원본 데이터는 유지한다. 잠실역 -> [잠실, 역, 잠실역]
