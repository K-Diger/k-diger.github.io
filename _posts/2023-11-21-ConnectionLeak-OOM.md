---

title: DB Connection 부족 문제와 OOM 문제 해결 과정에 관하여
date: 2023-11-21
categories: [SHORTS]
tags: [SHORTS]
layout: post
toc: true
math: true
mermaid: true

---

# 1. 코드 전문 및 발생했던 문제점

```kotlin
@Component
class CrawlerBase {

    internal fun extractMoreHeadLineLinks(url: String, categoryName: CategoryName): Elements {
        return Jsoup.connect(url).get()
            .getElementsByClass(moreHeadLineLinksElements[categoryName]!!)
            .tagName("a")
    }

    internal fun extractAllHeadLineNewsLinks(allHeadLineMoreLinksDocs: Elements): List<String> {
        val allDetailHeadLineNewsLinks = mutableListOf<String>()

        for (element in allHeadLineMoreLinksDocs) {
            val link = element.toString()
            val start = link.indexOf("/")
            val end = link.indexOf("\" ")
            allDetailHeadLineNewsLinks.add(SYMBOLIC_LINK_BASE_URL + link.substring(start, end))
        }

        return allDetailHeadLineNewsLinks
            .filter { it != "" }
            .distinct()
    }

    internal fun extractNewsCardBundle(
        allHeadLineNewsLinks: List<String>,
        categoryName: CategoryName,
        category: Category,
    ): List<MutableList<News>> {
        val cardNewsBundle = mutableListOf<MutableList<News>>()
        var cardNews = mutableListOf<News>()

        for (link in allHeadLineNewsLinks) {
            var headLineFlag = true
            val moreDoc = Jsoup.connect(link).get()

            val crawledHtmlLinks = moreDoc
                .getElementsByClass(detailDocClassNames[categoryName]!!)
                .toString()
                .split("</a>")

            val crawledTitles = mutableListOf<String>()

            loopInHeadLine@
            for (htmlLink in crawledHtmlLinks) {
                val detailLink = Jsoup.parse(htmlLink)
                    .select("a[href]")
                    .attr("href")

                if (detailLink.isEmpty()) {
                    continue
                }

                // 너무 빠른 요청으로 인해 크롤링 차단을 방지하고자 0.1초의 간격 부여
                Thread.sleep(100)
                val detailDoc = Jsoup.connect(detailLink).get()
                val title = detailDoc.getElementsByClass(TITLE_CLASS_NAME).text()

                if (crawledTitles.contains(title)) {
                    continue@loopInHeadLine
                }

                crawledTitles.add(title)

                val content = detailDoc
                    .getElementsByClass(CONTENT_CLASS_NAME).addClass("#text")
                    .text()
                val imageLink = detailDoc.getElementById(IMAGE_ID_NAME).toString()
                val press = detailDoc.getElementsByClass(PRESS_CLASS_NAME).text()
                val writtenDateTime =
                    detailDoc.getElementsByClass(WRITTEN_DATETIME_CLASS_NAME).text()

                cardNews.add(
                    News(
                        title = title,
                        content = content,
                        thumbnailImageUrl = filterImageLinkForm(imageLink),
                        newsLink = detailLink,
                        press = press,
                        writtenDateTime = writtenDateTime,
                        type = convertHeadLine(headLineFlag),
                        crawledCount = 1,
                        category = category,
                    )
                )
                headLineFlag = false
            }
            cardNewsBundle.add(cardNews)
            cardNews = mutableListOf()
        }
        return cardNewsBundle
    }

    private fun filterImageLinkForm(rawImageLink: String): String {
        return rawImageLink
            .substringAfter("data-src=\"")
            .substringBefore("\"")
    }

    private fun convertHeadLine(headLineFlag: Boolean): String {
        return if (headLineFlag) {
            HEADLINE
        } else {
            NORMAL
        }
    }
}

@Component
class CrawlerCore(
    private val crawlerBase: CrawlerBase,
    private val categoryRepository: CategoryRepository,
    private val newsRepository: NewsRepository,
    private val newsBulkInsertRepository: NewsBulkInsertRepository,
    private val newsCardBulkInsertRepository: NewsCardBulkInsertRepository,
    private val keywordExtractor: KeywordExtractor,
    private val hotKeywordRepository: HotKeywordRepository,
) {

    @Retryable(value = [Exception::class], maxAttempts = 3)
    @Transactional(rollbackFor = [Exception::class])
    @Scheduled(cron = "0 0 * * * *")
    internal fun executeCrawling() {
        val crawledDateTime = LocalDateTime.now()
        val keywordsCountingPair = mutableMapOf<String, Int>()
        val persistenceTargetNewsCards = mutableListOf<NewsCard>()
        for (categoryPair in categoryToUrl) {
            val categoryName = categoryPair.key
            val categoryURL = categoryPair.value

            log.info { "$categoryName - ${crawledDateTime.format(ofPattern("yyyy-MM-dd HH:mm:ss"))} - crawling start" }

            val category = when (categoryName) {
                POLITICS -> categoryRepository.findByName(POLITICS)
                ECONOMIC -> categoryRepository.findByName(ECONOMIC)
                SOCIETY -> categoryRepository.findByName(SOCIETY)
                CULTURE -> categoryRepository.findByName(CULTURE)
                WORLD -> categoryRepository.findByName(WORLD)
                SCIENCE -> categoryRepository.findByName(SCIENCE)
            }
            log.info { "${category.name.name} is loaded" }

            val headLineLinks = crawlerBase.extractMoreHeadLineLinks(
                url = categoryURL,
                categoryName = categoryName
            )

            val crawledNewsCards = crawlerBase.extractNewsCardBundle(
                allHeadLineNewsLinks = crawlerBase.extractAllHeadLineNewsLinks(headLineLinks),
                categoryName = categoryName,
                category = category,
            )
            log.info { "crawledNewsCards size = ${crawledNewsCards.size}" }


            val persistenceNewsBundle = newsRepository.findAllByCategoryAndCreatedAtBetween(
                category = category,
                startDateTime = crawledDateTime.minusDays(1),
                endDateTime = crawledDateTime
            )
            log.info { "persistenceNewsBundle size = ${persistenceNewsBundle.size}" }

            crawledNewsCards.map { crawledNewsCard ->
                val persistenceTargetNewsBundle = mutableListOf<News>()
                crawledNewsCard.map { crawledNews ->
                    val alreadySavedNews = isAlreadySavedNews(crawledNews, persistenceNewsBundle)
                    if (alreadySavedNews != null) {
                        alreadySavedNews.increaseCrawledCount()
                        persistenceTargetNewsBundle.add(alreadySavedNews)
                    } else {
                        persistenceTargetNewsBundle.add(crawledNews)
                    }
                }

                // 크롤러한 뉴스 삽입 전 마지막 News의 Index
                var currentLastNewsIndex = 1L

                // 현재 DB에 존재하는 가장 마지막 뉴스
                val lastNews = newsRepository.findTopByOrderByIdDesc()
                log.info { "$lastNews is loaded" }


                // 만약 DB에 뉴스가 존재한다면 해당 뉴스의 id + 1를 다음에 삽입될 인덱스로 지정
                if (lastNews != null) {
                    currentLastNewsIndex = lastNews.id + 1
                }

                // 크롤러한 뉴스 삽입 후 마지막 News의 Index
                val newNewsLastIndex = newsBulkInsertRepository.bulkInsert(
                    newsBundle = persistenceTargetNewsBundle,
                    crawledDateTime = crawledDateTime
                )

                val extractedKeywords = keywordExtractor.extractKeywordV2(
                    newsRepository.findById(newNewsLastIndex!!.toLong()).get().content
                )
                log.info { "$extractedKeywords - keyword is extracted" }

                val persistenceNewsCard = NewsCard(
                    category = category,
                    multipleNews = filterSquareBracket(
                        (currentLastNewsIndex..newNewsLastIndex).joinToString(", ")
                    ),
                    keywords = extractedKeywords,
                    createdAt = LocalDateTime.now(),
                    modifiedAt = crawledDateTime,
                )
                persistenceTargetNewsCards.add(persistenceNewsCard)
                keywordsCountingPair += countKeyword(keywordsCountingPair, extractedKeywords)
            }
            log.info("$categoryName - crawled complete!!")
            Thread.sleep(1000)
        }
        newsCardBulkInsertRepository.bulkInsert(persistenceTargetNewsCards, crawledDateTime)
        saveKeywordRanking(keywordsCountingPair)
        log.info("$crawledDateTime - all crawling done")
    }

    @Recover
    fun recover(exception: Exception) {
        log.error { "크롤링 중 예외가 발생하여 총 3회를 시도했으나 작업이 실패했습니다." }
        log.error { "ExceptionMessage : ${exception.message}" }
        log.error { "ExceptionCause : ${exception.cause}" }
        log.error { "ExceptionStackTrace : ${exception.stackTrace}" }
        throw ShortsBaseException.from(
            shortsErrorCode = ShortsErrorCode.E500_INTERNAL_SERVER_ERROR,
            resultErrorMessage = "크롤링 중 예외가 발생하여 총 3회를 시도했으나 작업이 실패했습니다."
        )
    }

    private fun saveKeywordRanking(keywordsCountingPair: Map<String, Int>) {
        //1위 ~ 10위까지 키워드 랭킹 산정 및 저장, value 기준 내림차순
        val sortedKeywords = keywordsCountingPair.toList().sortedByDescending { it.second }
        val keywordRanking = StringBuilder()

        for (rank: Int in 0..9) {
            keywordRanking.append(sortedKeywords[rank]).append(", ")
        }

        hotKeywordRepository.save(HotKeyword(keywordRanking = keywordRanking.toString()))
    }

    private fun countKeyword(
        keywordsCountingPair: MutableMap<String, Int>,
        extractedKeyword: String,
    ): MutableMap<String, Int> {
        val keywords = extractedKeyword.split(", ")

        for (keyword in keywords) {
            val count = keywordsCountingPair.getOrDefault(keyword, 0)
            keywordsCountingPair[keyword] = count + 1
        }

        return keywordsCountingPair
    }

    private fun filterSquareBracket(target: String): String {
        return target
            .replace("[", "")
            .replace("]", "")
    }

    private fun isAlreadySavedNews(crawledNews: News, persistenceNewsBundle: List<News>): News? {
        for (persistenceNews in persistenceNewsBundle) {
            if (crawledNews.title in persistenceNews.title &&
                crawledNews.newsLink in persistenceNews.newsLink &&
                crawledNews.press in persistenceNews.press
            ) {
                return persistenceNews
            }
        }
        return null
    }
}
```

---

## 문제점 1. DB 커넥션 부족 현상 발생

기존 로직은 크롤링을 통해 얻은 데이터의 갯수만큼 반복문을 순회하며 쿼리를 보내는 로직이였다.

매 크롤링마다 약 800개에서 1500개까지 데이터가 추가되는데 현재 로직에 따르면 매 크롤링 주기마다 커넥션을 800개에서 1500개를 맺고 끊는 과정이 필요했던 것이다.

어떤 시기에 데이터가 삽입되지 않은 것을 확인해보니 DB 커넥션이 부족해서 모든 트랜잭션에 롤백되었다는 에러 메세지를 서버에서 확인할 수 있었다.

이 문제를 해결하기 위해서 Slow Query로 인해 어떤 트랜잭션에서 커넥션을 오래 사용할만한 부분을 찾아냈고, 커넥션을 최소화하여 데이터를 삽입할 수 있는 방법을 알아보기 시작했다.

기존 로직은 커넥션을 데이터의 갯수만큼 맺고 끊는다고 했다.

이를 한 커넥션에서 해결할 수 있는 방법이 벌크 삽입이라고 알게되어 실제 코드로 적용하는 방법을 알아보기 시작했다.

---

### Spring Data JPA - saveAll()

`saveAll()` 메서드의 구현 부분을 보면 트랜잭션은 하나로 가져가되 그 내부에서 반복문을 통해 다수의 데이터를 삽입하는 로직으로 구성되어있다.

즉, 벌크 삽입과는 다른 결의 삽입 연산자이다.

실제로 테스트를 통해 반복문 내부에 `save()`메서드를 호출하는 것과 `saveAll()`메서드를 호출하는 것을 측정했을 때

`save()`메서드는 6134ms

`saveAll()`메서드는 4736ms가 소요되었다.

로직을 수행하는 시간 자체가 줄었으나 완전한 방법은 아니라고 생각했다.

---

### JdbcTemplate

`saveAll()` 메서드는 JPA Hibernate가 만들어주는 쿼리를 사용하기 때문에 결국에 부가적인 작업이 더 필요하다.

따라서 직접 벌크 삽입을 쿼리할 수 있는 방법을 찾아보니 JdbcTemplate이 있다는 것을 알게 되었다.

JdbcTemplate으로 똑같은 환경에서 똑같은 데이터를 삽입하는 과정을 측정해보니 2952ms가 측정되었다.

위에서 보았던 `saveAll()`메서드에 비해서도 상당히 성능이 개선되었다.

하지만 여기서 문제점이 있었다. JPA를 사용하지 않기 때문에 영속성에 해당되지 않기 때문에 JPA가 매핑하는 AutoIncrement가 적용된 PK를 인식하지 못하는 현상이 발생했다.

따라서 AutoIncrement될 것으로 생각하여 PK를 제외한 값을 넣고 Save Insert를 하면 id는 null 값이 들어간 상태가 된다.

이 문제를 해결하기 위해 직접 PK를 다루는 부가적인 로직이 추가되었다.

1. 데이터 삽입 전 현재 DB에 있는 가장 마지막 인덱스를 뽑아온다.
2. 데이터를 삽입 후 가장 마지막의 인덱스를 뽑아온다.
3. 1번과 2번의 사이에 해당하는 모든 수를 추출하여 Wrapper Entity에서 보관하고 사용한다.

아래는 위 내용을 모두 포함하여 구현한 코드이다.

```kotlin
class CrawlerCore() {

    ...

    // 크롤러한 뉴스 삽입 전 마지막 News의 Index
    var currentLastNewsIndex = 1L

    // 현재 DB에 존재하는 가장 마지막 뉴스
    val lastNews = newsRepository.findTopByOrderByIdDesc()
    log.info { "$lastNews is loaded" }


    // 만약 DB에 뉴스가 존재한다면 해당 뉴스의 id + 1를 다음에 삽입될 인덱스로 지정
    if (lastNews != null) currentLastNewsIndex = lastNews.id + 1

    // 크롤러한 뉴스 삽입 후 마지막 News의 Index
    val newNewsLastIndex = newsBulkInsertRepository.bulkInsert(
        newsBundle = persistenceTargetNewsBundle,
        crawledDateTime = crawledDateTime
    )

    ...
}

@Repository
class NewsBulkInsertRepository(
    private val jdbcTemplate: JdbcTemplate,
) {

    @Transactional
    fun bulkInsert(newsBundle: List<News>, crawledDateTime: LocalDateTime): Long? {
        val sql =
            """INSERT INTO news (title, content, news_link, press, thumbnail_image_url, type, written_date_time, crawled_count, category_id, created_at, modified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimMargin()

        jdbcTemplate.batchUpdate(
            sql,
            object : BatchPreparedStatementSetter {
                override fun setValues(ps: PreparedStatement, i: Int) {
                    val news = newsBundle[i]
                    ps.setString(1, news.title)
                    ps.setString(2, news.content)
                    ps.setString(3, news.newsLink)
                    ps.setString(4, news.press)
                    ps.setString(5, news.thumbnailImageUrl)
                    ps.setString(6, news.type)
                    ps.setString(7, news.writtenDateTime)
                    ps.setInt(8, news.crawledCount)
                    ps.setLong(9, news.category.id)
                    ps.setTimestamp(10, Timestamp.valueOf(crawledDateTime))
                    ps.setTimestamp(11, Timestamp.valueOf(LocalDateTime.now()))
                }

                override fun getBatchSize(): Int {
                    return newsBundle.size
                }
            }
        )
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long::class.java)
    }
}
```

---

### 이 데이터를 벌크 삽입으로 했을 때 문제점은 없는가?

- 트랜잭션 자체의 크기가 커지기 때문에 작업이 중간에 실패하면 데이터의 무결성이 깨질 수 있다.
    - 롤백 시에도 많은 시간이 소요될 수 있다.
- 트랜잭션의 크기 자체가 크기 때문에 커넥션을 오래 가지고 있는다는 문제점이있다.

---

### 벌크 삽입의 문제점을 어떻게 해결할 수 있을까?

- 삽입할 데이터를 더 작은 단위들로 분할하여 삽입하도록 한다.
    - 이렇게 하면 트랜잭션 크기가 줄어들기 때문에 롤백과 커넥션에 대한 문제점이 어느정도 완화될 수 있다.
    - 만약 순서까지 보장해야한다면 해당 로직 자체를 특정 Queue에 순서에 맞게 삽입한 후 Pop하면서 쪼개진 삽입 연산을 수행할 것 같다.

---

## 문제점 2. 크롤러 동작 간 OOM 발생

크롤러는 1시간 주기로 동작하는데, 어느 날 데이터베이스에 정상적으로 데이터가 삽입되지 않은 것을 확인하여 서버에 접속해보니 Heap 공간이 부족하다는 에러가 발생했다.

---

### 해결 과정 1. Heap 조정

기존 서버 스펙은 NCP의 Compact옵션인 (CPU: 2CORE, Memory : 2GB)를 사용하고 있었다.

서버 내 Java 버전은 OpenJDK 17을 사용하는 것으로 아무런 튜닝 옵션을 주지 않고 애플리케이션을 실행하고 있었기 때문에 다음과 같은 JVM 스펙이 동작하고 있었다.

- 초기 힙 크기 : 물리적 메모리의 1/64 == 8.388608MB

- 최대 힙 크기 : 물리적 메모리의 1/4 == 1GB

[JDK 17](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-2.html)

기본값으로 구동되는 옵션의 기준은 아래 링크에 설명되어있다.

[Oracle Docs](https://www.oracle.com/java/technologies/ergonomics5.html)

여튼 기본값을 지정된 초기 힙 크기를 가지고 크롤러를 돌릴 때 문제가 발생한다고 하니까 이를 해결해보자했지만

NCP 모니터링 대시보드와 로컬 환경에서 직접 크롤러를 기동시키니 1.8GB ~ 2GB의 메모리를 요구하는 것으로 보여졌다.

즉, 전체 물리 메모리의 크기만큼 할당해줘야하는 것인데 이는 시스템이 다운될 수 있으므로 곧바로 적용하진 않았다.

---

### 해결 과정 2. Unreachable Reference 만들기

Heap공간이 부족하다면 GC가 제대로 동작하는지부터 생각을 해봐야한다. 즉, GC의 대상이 되기 위해선 객체를 Unreachable Reference로 만들어줘야한다.

코드 단에서 이를 만족시킬 부분이 있는지 분석하기 시작했다. 그리고 발견한 부분은`문제점 1`에서 해결한 벌크 삽입 코드를 보았을 때 800 ~ 1,500개의 객체를 데이터베이스에 삽입 직전까지 들고있는 것이 최적화 지점이라고 생각했다.

벌크 삽입의 방식은 유지하되 많은 객체를 너무 오래 갖고 있지 않게 개선하기 위해 이를 100개씩 분할하여 벌크 삽입 하는 로직으로 개선해봤다.

```kotlin
@Component
class CrawlerCore(
    private val crawlerBase: CrawlerBase,
    ...
) {
    @Retryable(value = [Exception::class], maxAttempts = 3)
    @Transactional(rollbackFor = [Exception::class])
    @Scheduled(cron = "0 0 * * * *")
    internal fun executeCrawling() {

        ...

        // 개선된 로직 - 약 1,500개의 데이터를 삽입 직전까지 들고 있지 않고 100개씩 분할하여 벌크 삽입한다.
        if (persistenceTargetNewsCards.size >= 100) {
            newsCardBulkInsertRepository.bulkInsert(persistenceTargetNewsCards, crawledDateTime)
            persistenceTargetNewsCards.clear()
        }

        ...
    }
}
```

NCP Server대시보드를 통해 모니터링 해봤을 때 메모리 사용량이 크게 줄어들진 않았으나 유의미하게 줄어든 것을 확인할 수 있었다.

하지만 여전히 간헐적으로 OOM문제가 발생하여 `해결 과정 3`이라는 최후의 보루를 선택했다.

---

### 해결 과정 3. Scale-Up

우선 JVM의 절대적인 Heap 공간이 모자라다는 것이 문제다. `해결 과정 2`에서 개선한 최적화를 적용해도 크롤러가 요구하는 Memory Size는 넉넉잡아 약 2GB 언저리이다.

따라서 애플리케이션 코드를 더 최적화 하지 않는 이상 최대 메모리를 2GB로 돌리는 것은 불가능할 것이다.

서버의 스펙을 올린다. 기본 2Core 2GB Memory에서 2Core 4GB Memory로 스펙을 올렸다.

서버 스펙을 올려 메모리를 넉넉하게 발급했음에도 불구하고 아래와 같은 에러가 뜨고있었다.

```text
Exception: java.lang.OutOfMemoryError thrown from the UncaughtExceptionHandler in thread "http-nio-8081-Poller"
Exception in thread "HikariPool-1 housekeeper" java.lang.OutOfMemoryError: Java heap space
Exception in thread "Catalina-utility-2" java.lang.OutOfMemoryError: Java heap space
```

여전히 Heap 공간이 모자란 것인데, 이 역시 JVM의 기본 값으로 Heap 사이즈를 설정했기 때문에 그 사이즈로도 감당이 안된다는 것이다. 스펙업을 통해 얻은 여유 공간의 메모리를 조금 더 할당하도록 튜닝해야한다.

```shell
sudo mkdir -p gclog && nohup java -server -Xms1g -Xmx2560m -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/dumps -XX:+DisableExplicitGC -Xlog:gc*:file=gclog/gc.log.$(date +%Y-%m-%d):time,tags:filecount=5,filesize=10m -jar -Dspring.profiles.active=dev *.jar --jasypt.encryptor.password=shorts** > /root/nohup.out 2>&1 &
```

위 명령어는 JVM 옵션을 커스텀하여 실행하도록 하는 것이다.

- **-Xms1g**는 최소 힙 사이즈를 나타내는 것으로 1G를 지정했다.

- **-Xmx2048m**은 최대 힙 사이즈를 나타내는 것으로 2560M를 지정했다.

- 메모리가 4GB로 공식문서에서 권장하는 최소 메모리 스펙에도 알맞기 때문에 G1GC를 GC로 지정해주었다. 기존 서버 스펙에서 사용되고 있는 OpenJdk17의 기본 GC는 Serial로 지정되어있었기 때문이다.

이 과정들로 다행히 간헐적으로 발생하던 OOM문제는 해결했다. 하지만 마지막에는 Scale-Up을 수행한 것이기 때문에 코드 최적화를 더 수행할 수 없었는지에 대한 아쉬움이 남는다.

---

## 문제점 3. 크롤러 실패에 대한 처리가 이루어지지 않음

기존 크롤링 코드에는 크롤링이 동작하다가 어떤 이유에서든지 실패하게 된다면, 그 시간대의 데이터는 다시는 볼 수 없게 되었다.

크롤러는 외부 의존성에 강하게 엮여있기 때문에 예측할 수 없는 상황이 많이 발생하기도 하고, 같은 코드를 실행시키는 것임에도 예외가 발생할 때도 있고 성공할 때도 있는 현상이 종종 발생했다.

그래서 이런 네트워크 문제로 예상되는 예외가 발생했을 때 재시도를하여 원하는 타이밍에 데이터를 삽입하진 못하더라도 결국에는 데이터를 유실하지 않도록 할 수 있는 방법을 알아보기로 했다.

---

### @Retryable

@Retryable 애노테이션을 활용하면 위와 같은 상황에서 재시도를 수행할 수 있게 된다.

```@Retryable(value = [Exception::class], maxAttempts = 3)```

value는 어떤 예외에서 재시도를 수행할 것인지 명시하는 옵션이다.

maxAttempts는 최대 몇 번 재시도를 수행할 것인지 명시하는 옵션이다.

이 애노테이션 하나로 아래와 같은 예외에 대한 코드를 전부 지울 수 있게 되어 가독성도 좋아진다.

```kotlin
var exceptionCount = 0
do {
    try {
        crawlingExecute()
    } catch (e: IOExcetion) {
        log.info {"Exception 발생!"}
    } while (++exceptionCount < 2)
}
```
