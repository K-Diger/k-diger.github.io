---

title: "형태소 분석기로 뉴스 키워드를 뽑기, Lucene과 Komoran 중 무엇을 고를까"
date: 2023-11-21
categories: [Java, Search]
tags: [Lucene, Nori, Komoran, MorphemeAnalyzer, Kotlin, Jsoup]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [Elasticsearch - Nori 한국어 분석 플러그인](https://www.elastic.co/guide/en/elasticsearch/plugins/current/analysis-nori.html)
- [Lucene - Korean Analyzer (Nori) API](https://lucene.apache.org/core/9_0_0/analysis/nori/index.html)
- [KOMORAN 문서](https://docs.komoran.kr/)
- [KOMORAN 저장소](https://github.com/shineware/KOMORAN)
- [세종 품사 태그 체계](https://docs.komoran.kr/firststep/postypes.html)

---

## 배경

뉴스 기사를 크롤링해서 본문을 요약한 키워드 몇 개를 뽑아야 했다. 방법을 찾다가 형태소 분석기를 쓰기로 했는데, 후보가 둘로 좁혀지면서 판단할 것이 생겼다.

- 형태소 분석기가 정확히 무엇을 해주는가? 단순히 공백으로 자르는 것과 무엇이 다른가?
- Lucene의 한국어 분석기와 Komoran 중 무엇을 고를 것인가?
- 뽑은 키워드가 기사의 핵심을 담게 하려면 무엇을 조정해야 하는가?

두 가지를 다 구현해보고 비교한 뒤 골랐다.

---

## 0. 형태소 분석기가 하는 일

공백으로 자르면 이렇게 된다.

```
"국방부가 폴란드와 방산 협력을 확대하기로 했습니다"
→ ["국방부가", "폴란드와", "방산", "협력을", "확대하기로", "했습니다"]
```

**조사가 붙은 채로 나온다.** `국방부가`와 `국방부는`이 서로 다른 단어로 세어지므로 빈도 집계가 어긋난다.

형태소 분석기는 품사를 판정하면서 의미 단위로 자른다.

```
→ 국방부(명사) / 가(조사) / 폴란드(명사) / 와(조사) / 방산(명사) / ...
```

**명사만 골라내면 키워드 후보가 된다.** 조사와 어미가 빠지고 같은 단어가 하나로 모인다.

---

## 1. 키워드 추출에 관한 기술 조사

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

Lucene의 내부 동작은 [ElasticSearch, 형태소 분석기 적용](/posts/ElasticSearch/)에 따로 정리해두었다.

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

    private fun calculateWordFrequencies(text: String, weight: Double): Map<String, Double> {
        val wordFrequencies = mutableMapOf<String, Double>()
        val tokenStream = createTokenStream(text)
        tokenStream.use { token ->
            token.reset()
            while (token.incrementToken()) {
                val term = token.getAttribute(CharTermAttribute::class.java).toString()
                if (term !in stopWords && term.length > 1) {
                    val frequency = wordFrequencies.getOrDefault(term, DEFAULT_FREQUENCY)
                    wordFrequencies[term] = frequency + weight
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

    private fun formatResult(wordFrequencies: Map<String, Double>): String {
        val sortedKeywords = wordFrequencies.entries.sortedByDescending { it.value }
        val topKeywords = sortedKeywords.take(KEYWORD_COUNT).map { it.key }
        return topKeywords.joinToString(", ")
    }

    companion object {
        private const val KEYWORD_COUNT = 5
        private const val TITLE_WEIGHT = 1.5
        private const val CONTENT_WEIGHT = 1.0
        private const val DEFAULT_FREQUENCY = 0.0
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

세 번째 질문의 답이 여기 있다. 기사 제목과 본문에 **다른 가중치**를 줬다. 뉴스 기사는 제목에 요지가 들어 있으므로, 제목에서 나온 단어에 1.5배를 주고 본문은 1.0배로 뒀다.

여기서 실제로 걸렸던 버그가 하나 있다. 처음에는 빈도를 `Int`로 집계하면서 `weight.toInt()`로 더했는데, **1.5가 1로 잘려서 가중치가 아무 효과가 없었다.** 집계 타입을 `Double`로 바꾸고 나서야 의도대로 동작했다. 정수 나눗셈이나 형변환으로 소수점이 조용히 사라지는 종류의 실수다.

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

## 3. 둘 중 어떤 것을 선택했는가

Lucene의 한국어 분석기를 골랐다. 두 번째 질문의 답이다.

```kotlin
val koreanTokenizer = KoreanTokenizer(
    KoreanTokenizer.DEFAULT_TOKEN_ATTRIBUTE_FACTORY,
    null,
    DecompoundMode.NONE,
    true
)
```

위와 같이 KoreanTokenizer를 생성할 때 `DecompoundMode.NONE`이라는 옵션을 줄 수 있는데 이 옵션은 복합명사를 분리하지 않는 옵션이다. 뉴스 기사에는 복합명사로 이루어진 구문이 다수 있기 때문에 이 옵션을 위해 Lucene을 채택했다.

세 옵션의 차이를 정리하면 이렇다.

| 옵션 | 동작 | `잠실역`을 넣으면 |
|---|---|---|
| `NONE` | 복합명사를 분리하지 않는다 | `잠실역` |
| `DISCARD` | 분리하고 원본은 버린다 | `잠실`, `역` |
| `MIXED` | 분리하고 원본도 남긴다 | `잠실`, `역`, `잠실역` |

키워드 추출에는 `NONE`이 맞았다. `잠실역`을 `잠실`과 `역`으로 쪼개면 `역`이라는 흔한 단어가 상위 키워드에 올라온다. **분리가 오히려 신호를 약하게 만드는 경우**다.

반대로 검색에는 `MIXED`가 유리하다. 사용자가 `잠실`만 쳐도 `잠실역` 문서가 나와야 하기 때문이다. **같은 분석기라도 용도에 따라 옵션이 달라진다.**

---

## 4. 정리하며

처음 던진 질문들에 대한 답이다.

**형태소 분석기가 무엇을 해주는가.** 품사를 판정하면서 의미 단위로 자른다. 조사와 어미가 분리되므로 `국방부가`와 `국방부는`이 하나로 모이고, 명사만 골라내면 그대로 키워드 후보가 된다.

**Lucene과 Komoran 중 무엇인가.** 복합명사 분리 여부를 옵션으로 고를 수 있다는 점이 결정적이었다. 뉴스 기사에는 복합명사가 많고, 그것을 쪼개면 흔한 단어가 상위로 올라와 키워드 품질이 떨어진다.

**핵심을 담게 하려면 무엇을 조정하는가.** 제목과 본문에 다른 가중치를 준다. 다만 그 가중치가 형변환으로 잘려나가지 않는지 확인해야 한다. 소수점 가중치를 정수로 집계하면 아무 일도 일어나지 않는다.

돌아보면 도구를 고르는 기준은 성능이 아니라 **"내 데이터의 특성에 맞는 옵션이 있는가"** 였다. 두 도구 모두 형태소 분석은 잘했고, 갈린 것은 복합명사를 어떻게 다루느냐 하나였다.
