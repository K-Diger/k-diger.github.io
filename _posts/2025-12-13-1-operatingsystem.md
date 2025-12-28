---

title: OS
date: 2025-12-13
categories: [OperatingSystem, OS, Linux]
tags: [OperatingSystem, OS, Linux]
layout: post
toc: true
math: true
mermaid: true

---

## 목차

### Part 0: 시스템 정보 확인

0. [리눅스 시스템 정보 확인](#0-리눅스-시스템-정보-확인)

### Part 1: 하드웨어 기초 개념

1. [CPU 아키텍처](#1-cpu-아키텍처)
2. [메모리 아키텍처](#2-메모리-아키텍처)
3. [스토리지 시스템](#3-스토리지-시스템)

### Part 2: 운영체제 핵심

4. [운영체제와 커널](#4-운영체제와-커널)
5. [시스템 콜과 인터럽트](#5-시스템-콜과-인터럽트)
6. [메모리 관리](#6-메모리-관리)
7. [프로세스 관리](#7-프로세스-관리)
8. [프로세스 스케줄링](#8-프로세스-스케줄링)
9. [시그널과 IPC](#9-시그널과-ipc)
10. [파일 시스템](#10-파일-시스템)
11. [디바이스와 I/O](#11-디바이스와-io)
12. [리눅스 보안 메커니즘 (컨테이너 기술의 기반)](#12-리눅스-보안-메커니즘-컨테이너-기술의-기반)

---

## 0. 리눅스 시스템 정보 확인

### 0.1 시스템 기본 정보

**운영체제 버전 및 커널 정보**

```bash
# 운영체제 배포판 확인
cat /etc/os-release
lsb_release -a  # Ubuntu/Debian

# 커널 버전 확인
uname -r        # 커널 버전만
uname -a        # 모든 시스템 정보
cat /proc/version

# 호스트명 확인
hostname
hostnamectl

# 시스템 아키텍처 (32bit/64bit)
arch
uname -m
getconf LONG_BIT
```

**출력 예시:**

```bash
$ cat /etc/os-release
NAME="Ubuntu"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 22.04.3 LTS"
VERSION_ID="22.04"

$ uname -r
5.15.0-91-generic

$ uname -m
x86_64
```

### 0.2 CPU 정보 확인

**CPU 상세 정보**

```bash
# CPU 정보 상세 출력
lscpu

# CPU 코어 수 확인
nproc                    # 논리 프로세서 수
lscpu | grep "^CPU(s):"  # 총 CPU 수
lscpu | grep "Core(s) per socket:"  # 소켓당 코어 수

# 물리 CPU 개수
lscpu | grep "Socket(s):"

# 하이퍼스레딩 확인
lscpu | grep "Thread(s) per core:"
# 2이면 하이퍼스레딩 활성화

# CPU 모델 확인
cat /proc/cpuinfo | grep "model name" | head -1

# 모든 CPU 코어 정보
cat /proc/cpuinfo
```

**출력 예시:**

```bash
$ lscpu
Architecture:            x86_64
CPU op-mode(s):          32-bit, 64-bit
Byte Order:              Little Endian
Address sizes:           39 bits physical, 48 bits virtual
CPU(s):                  8              # 논리 프로세서 8개
On-line CPU(s) list:     0-7
Thread(s) per core:      2              # 하이퍼스레딩 ON
Core(s) per socket:      4              # 물리 코어 4개
Socket(s):               1              # CPU 소켓 1개
NUMA node(s):            1
Vendor ID:               GenuineIntel
CPU family:              6
Model:                   142
Model name:              Intel(R) Core(TM) i7-8565U CPU @ 1.80GHz
```

**해석:**

- 물리 CPU: 1개 (Socket)
- 물리 코어: 4개 (Core per socket)
- 논리 코어: 8개 (Thread per core × Core per socket)
- 하이퍼스레딩: 활성화 (Thread per core = 2)

### 0.3 CPU 사용률 확인

```bash
# 실시간 CPU 사용률
top
htop  # 더 보기 좋음

# CPU 코어별 사용률
mpstat -P ALL 1

# 1초마다 CPU 통계
sar -u 1

# 평균 부하 (Load Average)
uptime
# load average: 1.52, 1.43, 1.38
# 1분, 5분, 15분 평균

# 코어당 평균 부하
# Load Average / CPU 코어 수
# 1.0 = 100% 사용
# > 1.0 = 대기 중인 프로세스 존재
```

**Load Average 해석:**

```bash
$ uptime
 14:23:01 up 5 days,  3:42,  2 users,  load average: 2.15, 1.87, 1.52

# CPU 코어가 4개인 경우:
# 2.15 / 4 = 0.54 (54% 사용) - 양호
# 8.0 / 4 = 2.0 (200% 사용) - 과부하
```

### 0.4 메모리 정보 확인

**메모리 용량 및 사용량**

```bash
# 메모리 사용량 (사람이 읽기 쉬운 형식)
free -h

# 메모리 상세 정보
cat /proc/meminfo

# 총 메모리 용량만
grep MemTotal /proc/meminfo
free -h | awk 'NR==2{print $2}'

# 메모리 하드웨어 정보 (타입, 속도, 슬롯)
dmidecode -t memory | grep -E "Size|Speed|Type:|Locator"
sudo lshw -short -C memory
```

**출력 예시:**

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi       3.2Gi       8.1Gi       234Mi       4.0Gi        11Gi
Swap:          2.0Gi          0B       2.0Gi

해석:
- total: 전체 물리 메모리 (16GB)
- used: 애플리케이션이 사용 중 (3.2GB)
- free: 완전히 비어있는 메모리 (8.1GB)
- buff/cache: 커널이 캐시로 사용 (4.0GB, 필요시 해제 가능)
- available: 실제 사용 가능한 메모리 (11GB)
```

**메모리 타입 확인:**

```bash
$ sudo dmidecode -t memory | grep -E "Type:|Speed:"
Type: DDR4
Speed: 3200 MT/s
Type: DDR4
Speed: 3200 MT/s
```

### 0.5 디스크 및 파티션 정보

**디스크 장치 확인**

```bash
# 연결된 모든 블록 디바이스
lsblk

# 디스크 상세 정보
fdisk -l
sudo parted -l

# 디스크 개수 및 모델
lsblk -d -o NAME,SIZE,MODEL
ls -l /dev/sd*   # SATA/SAS 디스크
ls -l /dev/nvme* # NVMe 디스크

# 디스크 하드웨어 정보
sudo smartctl -i /dev/sda
sudo hdparm -I /dev/sda
```

**출력 예시:**

```bash
$ lsblk
NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
sda           8:0    0 238.5G  0 disk
├─sda1        8:1    0   512M  0 part /boot/efi
├─sda2        8:2    0     2G  0 part [SWAP]
└─sda3        8:3    0   236G  0 part /
sdb           8:16   0   1.8T  0 disk
└─sdb1        8:17   0   1.8T  0 part /data
nvme0n1     259:0    0 465.8G  0 disk
└─nvme0n1p1 259:1    0 465.8G  0 part /mnt/nvme

해석:
- sda: 250GB SSD (파티션 3개)
- sdb: 2TB HDD (파티션 1개)
- nvme0n1: 500GB NVMe SSD (파티션 1개)
```

**파티션 및 파일시스템 정보**

```bash
# 마운트된 파일시스템 확인
df -h              # 사용량과 함께
df -hT             # 파일시스템 타입 포함
mount | column -t  # 마운트 정보

# 특정 디렉토리가 어느 파티션에 있는지
df -h /var/log

# 파티션 UUID 확인
blkid
lsblk -f

# 파티션 크기 및 사용률
du -sh /*          # 루트 디렉토리별 사용량
du -sh /var/*      # /var 하위 사용량
```

**출력 예시:**

```bash
$ df -hT
Filesystem     Type      Size  Used Avail Use% Mounted on
/dev/sda3      ext4      236G   45G  180G  20% /
/dev/sda1      vfat      512M   15M  497M   3% /boot/efi
/dev/sdb1      xfs       1.8T  856G  945G  48% /data
/dev/nvme0n1p1 ext4      466G  120G  323G  27% /mnt/nvme
```

**디스크 I/O 성능 확인**

```bash
# 디스크 I/O 통계
iostat -x 1

# 실시간 디스크 사용량
iotop

# 디스크 읽기 속도 테스트
sudo hdparm -t /dev/sda

# 디스크 쓰기 속도 테스트
dd if=/dev/zero of=testfile bs=1G count=1 oflag=direct
```

### 0.6 네트워크 인터페이스 정보

**네트워크 장치 확인**

```bash
# 네트워크 인터페이스 목록
ip link show
ifconfig -a

# IP 주소 확인
ip addr show
hostname -I

# 네트워크 인터페이스 상세 정보
ethtool eth0
ip -s link  # 통계 포함

# 라우팅 테이블
ip route show
route -n
```

**출력 예시:**

```bash
$ ip addr show
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
```

### 0.7 종합 시스템 정보

**한 번에 모든 정보 확인**

```bash
# 하드웨어 정보 종합
sudo lshw -short
sudo lshw -html > system-info.html

# 특정 클래스만 확인
sudo lshw -C cpu      # CPU
sudo lshw -C memory   # 메모리
sudo lshw -C disk     # 디스크
sudo lshw -C network  # 네트워크

# PCI 장치 목록
lspci
lspci | grep -i vga   # 그래픽 카드
lspci | grep -i eth   # 네트워크 카드

# USB 장치 목록
lsusb

# 시스템 요약
inxi -F  # 설치 필요: apt install inxi
neofetch # 설치 필요: apt install neofetch
```

**시스템 정보 스크립트 예제**

```bash
#!/bin/bash
# system-info.sh - 시스템 정보 출력 스크립트

echo "=== 시스템 기본 정보 ==="
echo "호스트명: $(hostname)"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "커널: $(uname -r)"
echo "아키텍처: $(uname -m)"
echo ""

echo "=== CPU 정보 ==="
echo "CPU 모델: $(lscpu | grep 'Model name' | cut -d':' -f2 | xargs)"
echo "소켓 수: $(lscpu | grep '^Socket' | awk '{print $2}')"
echo "물리 코어: $(lscpu | grep '^Core(s)' | awk '{print $4}')"
echo "논리 코어: $(nproc)"
echo "하이퍼스레딩: $(lscpu | grep '^Thread' | awk '{print $4}') threads/core"
echo ""

echo "=== 메모리 정보 ==="
free -h
echo ""

echo "=== 디스크 정보 ==="
lsblk -d -o NAME,SIZE,MODEL
echo ""

echo "=== 파티션 사용량 ==="
df -hT | grep -v tmpfs
echo ""

echo "=== 네트워크 인터페이스 ==="
ip -br addr show
echo ""

echo "=== Load Average ==="
uptime
```

**실행 예시:**

```bash
chmod +x system-info.sh
./system-info.sh
```

### 0.8 리눅스 디렉토리 구조 (FHS - Filesystem Hierarchy Standard)

**루트 디렉토리 (/) 구조**

리눅스는 계층적 디렉토리 구조를 가지며, 각 디렉토리는 특정 목적을 가진다.

```
/
├── bin/      # 기본 사용자 명령어 (ls, cp, cat 등)
├── boot/     # 부팅에 필요한 파일 (커널, initrd)
├── dev/      # 디바이스 파일 (장치 파일)
├── etc/      # 시스템 설정 파일
├── home/     # 사용자 홈 디렉토리
├── lib/      # 공유 라이브러리
├── media/    # 이동식 미디어 마운트 포인트
├── mnt/      # 임시 마운트 포인트
├── opt/      # 추가 소프트웨어 패키지
├── proc/     # 프로세스 및 커널 정보 (가상 파일시스템)
├── root/     # root 사용자 홈 디렉토리
├── run/      # 런타임 데이터 (PID 파일 등)
├── sbin/     # 시스템 관리자 명령어
├── srv/      # 서비스 데이터
├── sys/      # 시스템 정보 (가상 파일시스템)
├── tmp/      # 임시 파일 (재부팅 시 삭제)
├── usr/      # 사용자 프로그램 및 데이터
└── var/      # 가변 데이터 (로그, 캐시, 데이터베이스)
```

**주요 디렉토리 상세 설명**

**`/bin` - Essential User Binaries**

```bash
# 시스템 부팅과 복구에 필요한 기본 명령어
ls /bin
# bash, cat, cp, ls, mkdir, mv, rm, sh, etc.

# /usr/bin과 통합되는 추세 (심볼릭 링크)
ls -l /bin
# lrwxrwxrwx 1 root root 7 Mar 10  2023 /bin -> usr/bin
```

**`/boot` - Boot Loader Files**

```bash
ls -lh /boot
# vmlinuz-*        # 리눅스 커널 이미지
# initrd.img-*     # 초기 RAM 디스크
# grub/            # GRUB 부트로더 설정

# 커널 버전 확인
ls /boot/vmlinuz-*
```

**`/dev` - Device Files**

```bash
# 모든 하드웨어를 파일로 표현
ls -l /dev
# /dev/sda         # 첫 번째 SATA 디스크
# /dev/null        # null 디바이스 (데이터 버림)
# /dev/zero        # 0으로 채워진 무한 스트림
# /dev/random      # 난수 생성기
# /dev/tty         # 현재 터미널

# 디스크 파티션
ls /dev/sd*       # SATA/SAS 디스크
ls /dev/nvme*     # NVMe 디스크
```

**`/etc` - Configuration Files**

```bash
# 시스템 전체 설정 파일
ls /etc
# /etc/fstab           # 파일시스템 마운트 설정
# /etc/hosts           # 호스트 이름 매핑
# /etc/passwd          # 사용자 계정 정보
# /etc/group           # 그룹 정보
# /etc/ssh/sshd_config # SSH 서버 설정
# /etc/systemd/        # systemd 설정
# /etc/nginx/          # Nginx 설정
# /etc/docker/         # Docker 설정

# 주의: /etc는 텍스트 설정 파일만, 데이터는 /var에
```

**`/home` - User Home Directories**

```bash
# 각 사용자의 개인 디렉토리
ls /home
# /home/user1/
# /home/user2/

# 사용자 데이터, 설정 파일 저장
ls -a ~/
# .bashrc, .ssh/, Documents/, Downloads/
```

**`/var` - Variable Data**

```bash
# 지속적으로 변하는 데이터 저장
ls /var
# /var/log/            # 로그 파일
# /var/lib/            # 애플리케이션 상태 정보
# /var/cache/          # 캐시 데이터
# /var/spool/          # 스풀 디렉토리 (메일, 프린터)
# /var/tmp/            # 재부팅 후에도 유지되는 임시 파일
# /var/run/            # 런타임 데이터 (/run으로 심볼릭 링크)

# 애플리케이션별 데이터
ls /var/lib/
# /var/lib/docker/     # Docker 데이터 (이미지, 컨테이너, 볼륨)
# /var/lib/mysql/      # MySQL 데이터베이스
# /var/lib/postgresql/ # PostgreSQL 데이터베이스
# /var/lib/redis/      # Redis 데이터
# /var/lib/kubelet/    # Kubernetes kubelet 데이터

# 로그 파일
ls /var/log/
# /var/log/syslog      # 시스템 로그
# /var/log/auth.log    # 인증 로그
# /var/log/nginx/      # Nginx 로그
# /var/log/mysql/      # MySQL 로그
```

**`/usr` - User Programs**

```bash
# 사용자 애플리케이션과 데이터
ls /usr
# /usr/bin/            # 사용자 명령어
# /usr/sbin/           # 시스템 관리 명령어
# /usr/lib/            # 라이브러리
# /usr/local/          # 로컬 설치 소프트웨어
# /usr/share/          # 공유 데이터 (문서, 아이콘 등)

# /usr은 읽기 전용으로 마운트 가능
```

**`/tmp` vs `/var/tmp`**

```bash
# /tmp - 재부팅 시 삭제
# - tmpfs로 마운트되어 RAM에 존재
# - 빠르지만 용량 제한
# - 10일 이상 된 파일 자동 삭제

# /var/tmp - 재부팅 후에도 유지
# - 디스크에 저장
# - 30일 이상 된 파일 자동 삭제
```

**디렉토리 크기 확인**

```bash
# 주요 디렉토리 크기 확인
du -sh /*

# /var 하위 디렉토리 크기 (용량 많이 차지하는 곳 찾기)
du -sh /var/* | sort -hr

# /var/log 로그 파일 크기
du -sh /var/log/*

# 특정 디렉토리에서 큰 파일 찾기
find /var -type f -size +100M -exec ls -lh {} \; 2>/dev/null
```

**디렉토리별 권장 파티션 분리**

운영 환경에서는 다음 디렉토리를 별도 파티션으로 분리하는 것이 좋다:

| 디렉토리                  | 이유                               | 권장 크기     |
|-----------------------|----------------------------------|-----------|
| `/`                   | 루트 파일시스템                         | 20-50GB   |
| `/boot`               | 커널 업데이트 시 공간 부족 방지               | 512MB-1GB |
| `/home`               | 사용자 데이터 보호                       | 필요에 따라    |
| `/var`                | 로그, 데이터 증가로 인한 루트 파티션 가득 차는 것 방지 | 50GB+     |
| `/var/log`            | 로그 폭증으로 /var 파티션 가득 차는 것 방지      | 10-50GB   |
| `/tmp`                | 임시 파일로 인한 디스크 고갈 방지              | 5-10GB    |
| **`/var/lib/docker`** | Docker 데이터 격리, 디스크 증가 관리         | 100GB+    |

**왜 파티션을 분리하는가?**

1. **보안**: `/tmp`, `/var/tmp`를 `noexec` 옵션으로 마운트하여 악성코드 실행 방지
2. **안정성**: 로그가 가득 차도 시스템 루트 파일시스템은 안전
3. **성능**: 각 파티션에 최적의 파일시스템 선택 가능
4. **관리**: 특정 디렉토리만 백업, 마운트 옵션 적용 가능

### 0.9 /var/lib/docker 디렉토리 격리 전략

**문제점: Docker 데이터가 루트 파티션을 가득 채울 수 있다**

Docker는 기본적으로 `/var/lib/docker`에 모든 데이터를 저장한다:

- 컨테이너 이미지
- 실행 중인 컨테이너 레이어
- 볼륨 데이터
- 빌드 캐시

이 데이터가 증가하면 루트 파티션이 가득 차서 시스템 전체가 멈출 수 있다.

**격리 방법 1: 별도 파티션 생성**

```bash
# 1. 새 파티션 생성 (예: /dev/sdb1)
sudo fdisk /dev/sdb
# n (새 파티션), p (primary), 1, Enter, Enter, w (저장)

# 2. 파일시스템 생성
sudo mkfs.ext4 /dev/sdb1
# 또는 XFS (대용량 파일에 유리)
sudo mkfs.xfs /dev/sdb1

# 3. Docker 서비스 중지
sudo systemctl stop docker

# 4. 기존 Docker 데이터 백업
sudo mv /var/lib/docker /var/lib/docker.bak

# 5. 마운트 포인트 생성
sudo mkdir -p /var/lib/docker

# 6. 파티션 마운트
sudo mount /dev/sdb1 /var/lib/docker

# 7. 기존 데이터 복사 (있다면)
sudo rsync -avxHAX /var/lib/docker.bak/ /var/lib/docker/

# 8. /etc/fstab에 영구 마운트 설정 추가
sudo blkid /dev/sdb1  # UUID 확인
# UUID=xxxxx-xxxxx /var/lib/docker ext4 defaults 0 2

echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /var/lib/docker ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab

# 9. Docker 재시작
sudo systemctl start docker

# 10. 확인
df -h /var/lib/docker
docker info | grep "Docker Root Dir"
```

**격리 방법 2: LVM (Logical Volume Manager) 사용** (권장)

LVM을 사용하면 동적으로 파티션 크기를 조정할 수 있어 매우 유연하다.

```bash
# 1. LVM 설치
sudo apt install lvm2

# 2. Physical Volume 생성
sudo pvcreate /dev/sdb

# 3. Volume Group 생성
sudo vgcreate vg-docker /dev/sdb

# 4. Logical Volume 생성 (100GB 할당)
sudo lvcreate -L 100G -n lv-docker vg-docker

# 5. 파일시스템 생성
sudo mkfs.ext4 /dev/vg-docker/lv-docker

# 6. Docker 중지 및 데이터 이동
sudo systemctl stop docker
sudo mv /var/lib/docker /var/lib/docker.bak
sudo mkdir -p /var/lib/docker

# 7. LV 마운트
sudo mount /dev/vg-docker/lv-docker /var/lib/docker

# 8. 데이터 복사
sudo rsync -avxHAX /var/lib/docker.bak/ /var/lib/docker/

# 9. /etc/fstab 설정
echo "/dev/vg-docker/lv-docker /var/lib/docker ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab

# 10. Docker 재시작
sudo systemctl start docker

# LVM의 장점: 용량 부족 시 동적 확장 가능
# 용량 확장 (50GB 추가)
sudo lvextend -L +50G /dev/vg-docker/lv-docker
sudo resize2fs /dev/vg-docker/lv-docker  # ext4
# 또는
sudo xfs_growfs /var/lib/docker  # xfs
```

**격리 방법 3: Docker 데이터 디렉토리 변경**

```bash
# /etc/docker/daemon.json 생성/수정
sudo mkdir -p /etc/docker
cat <<EOF | sudo tee /etc/docker/daemon.json
{
  "data-root": "/mnt/docker-data"
}
EOF

# 새 디렉토리 생성 (별도 파티션에)
sudo mkdir -p /mnt/docker-data

# 기존 데이터 이동
sudo systemctl stop docker
sudo rsync -avxHAX /var/lib/docker/ /mnt/docker-data/

# Docker 재시작
sudo systemctl start docker

# 확인
docker info | grep "Docker Root Dir"
# Docker Root Dir: /mnt/docker-data
```

**격리 방법 4: 심볼릭 링크 (간단하지만 권장하지 않음)**

```bash
# Docker 중지
sudo systemctl stop docker

# 데이터 이동
sudo mv /var/lib/docker /mnt/docker-data

# 심볼릭 링크 생성
sudo ln -s /mnt/docker-data /var/lib/docker

# Docker 재시작
sudo systemctl start docker

# 단점: 일부 도구가 심볼릭 링크를 제대로 처리하지 못할 수 있음
```

**NAS 마운트의 문제점** (면접에서 안 좋은 반응이었던 이유)

```bash
# NAS (NFS, CIFS) 마운트 문제점:
# 1. 네트워크 지연으로 인한 성능 저하 (컨테이너 시작이 매우 느림)
# 2. Docker overlay2 스토리지 드라이버는 로컬 파일시스템 필요
# 3. 네트워크 끊김 시 Docker 전체 중단
# 4. IOPS 부족으로 컨테이너 시작/중지 느림
# 5. 파일 권한 문제 (특히 CIFS)
# 6. flock() 같은 파일 잠금이 제대로 동작하지 않을 수 있음
```

**권장 방법 비교**

| 방법              | 장점           | 단점            | 권장 상황        |
|-----------------|--------------|---------------|--------------|
| **별도 파티션**      | 간단, 안정적      | 크기 고정         | 소규모 환경       |
| **LVM**         | 동적 확장 가능, 유연 | 복잡도 증가        | 중대규모 환경 (권장) |
| **데이터 디렉토리 변경** | 간단           | 기존 데이터 이동 필요  | 초기 설정 시      |
| **심볼릭 링크**      | 매우 간단        | 비권장 (버그 가능성)  | 임시 방편        |
| **NAS 마운트**     | 중앙화된 스토리지    | 성능 저하, 안정성 문제 | 불가 비권장       |

**Production 환경 권장 구성**

```bash
# LVM으로 유연한 스토리지 관리
# 1. /var/lib/docker를 별도 LV로 분리
# 2. Thin Provisioning으로 공간 효율화
# 3. 스냅샷 기능으로 백업 용이

# Thin Provisioning 설정
sudo lvcreate -L 50G -T vg-docker/thin-pool
sudo lvcreate -V 200G -T vg-docker/thin-pool -n lv-docker

# 장점:
# - 실제 사용량만큼만 물리 공간 사용
# - 200GB 논리 볼륨이지만 실제로는 50GB만 할당
# - 필요 시 thin-pool 확장
```

**모니터링 및 관리**

```bash
# Docker 데이터 사용량 확인
du -sh /var/lib/docker
docker system df

# 사용하지 않는 데이터 정리
docker system prune -a --volumes

# 파티션 사용률 모니터링
df -h /var/lib/docker

# LVM 사용률 확인
sudo lvs
sudo vgs
sudo pvs

# 알림 설정 (80% 이상 시 알림)
# /etc/cron.hourly/check-docker-disk
#!/bin/bash
USAGE=$(df -h /var/lib/docker | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $USAGE -gt 80 ]; then
    echo "Docker disk usage is ${USAGE}%" | mail -s "Docker Disk Alert" admin@example.com
fi
```

**면접 질문 대응 완벽 정리**

**질문**: "/var/lib/docker를 격리할 수 있나요?"

**모범 답변**:
"네, 여러 방법이 있는데 가장 권장하는 방법은 **LVM으로 별도 Logical Volume을 생성**하는 것입니다.

**LVM을 추천하는 이유:**

1. **격리**: 루트 파일시스템과 완전히 분리되어 Docker 데이터가 증가해도 시스템에 영향 없음
2. **동적 확장**: 용량 부족 시 `lvextend`로 온라인 확장 가능 (서비스 중단 없음)
3. **성능**: 로컬 디스크 사용으로 빠른 I/O
4. **관리**: LVM 스냅샷으로 백업 용이, Thin Provisioning으로 공간 효율화

**구현 방법:**

```bash
pvcreate /dev/sdb
vgcreate vg-docker /dev/sdb
lvcreate -L 100G -n lv-docker vg-docker
mkfs.ext4 /dev/vg-docker/lv-docker
mount /dev/vg-docker/lv-docker /var/lib/docker
```

**NAS 마운트를 권장하지 않는 이유:**

- 네트워크 지연으로 컨테이너 시작이 매우 느림
- Docker overlay2 드라이버가 로컬 파일시스템을 요구
- 네트워크 장애 시 Docker 전체 중단
- IOPS 부족으로 성능 저하

프로덕션 환경에서는 LVM + Thin Provisioning 조합이 가장 유연하고 안정적입니다."

---

## 1. CPU 아키텍처

### 1.1 CPU 기본 구조

**CPU의 주요 구성 요소**

CPU는 다음과 같은 핵심 부품으로 구성된다:

- **ALU (Arithmetic Logic Unit)**: 산술 및 논리 연산 수행
- **Control Unit**: 명령어 해석 및 실행 제어
- **Registers**: CPU 내부의 초고속 저장 공간
- **Cache**: L1, L2, L3 캐시 메모리

**CPU 계층 구조**

```
물리적 구성요소:
  Socket (물리 CPU/소켓)
    └─ Core (물리 코어)

논리적 구성요소:
  Hardware Thread (하드웨어 스레드/논리 코어)
    - 운영체제가 인식하는 CPU 단위
    - 하이퍼스레딩 OFF: 물리 코어 1개 = 논리 코어 1개
    - 하이퍼스레딩 ON: 물리 코어 1개 = 논리 코어 2개
```

**스레드의 종류 구분**

1. **Hardware Thread (하드웨어 스레드)**

- CPU 관점의 실행 단위
- 물리 코어의 실행 파이프라인을 공유
- 하이퍼스레딩 기술로 생성

2. **Software Thread (소프트웨어 스레드)**

- 운영체제/프로그램 관점의 실행 단위
- 프로세스 내부의 실행 흐름
- pthread, Java Thread 등

### 1.2 하이퍼스레딩 (Hyper-Threading)

**하이퍼스레딩이란?**

하이퍼스레딩(HT)은 인텔의 기술로, 하나의 물리 코어가 두 개의 하드웨어 스레드(논리 코어)로 보이게 하는 기술이다. AMD에서는 SMT(Simultaneous Multi-Threading)라고 부른다.

**물리 코어 vs 논리 코어**

- **물리 코어 (Physical Core)**: 실제 하드웨어 실행 유닛
- **논리 코어 (Logical Core)**: 운영체제가 인식하는 CPU (하드웨어 스레드)
- 하이퍼스레딩은 물리 코어 내부의 실행 유닛을 두 개의 논리 코어가 시분할로 공유

**작동 원리**

```
하이퍼스레딩 비활성화:
  물리 코어 1개 = 논리 코어 1개

하이퍼스레딩 활성화:
  물리 코어 1개 = 논리 코어 2개
```

- 하나의 물리 코어 내부의 실행 유닛을 두 개의 스레드가 공유
- 한 스레드가 메모리 대기 중일 때 다른 스레드가 CPU 활용
- 이론상 30-40% 성능 향상 (상황에 따라 다름)

**하이퍼스레딩 확인**

```bash
# Thread per core가 2이면 HT 활성화
$ lscpu | grep "Thread(s) per core:"
Thread(s) per core:      2

# 예시: 4코어 CPU에서 HT 활성화
Socket(s):               1
Core(s) per socket:      4
Thread(s) per core:      2
CPU(s):                  8  # 4코어 × 2 = 8 논리 프로세서
```

**장단점**

**장점:**

- 멀티스레드 워크로드에서 성능 향상
- 서버 환경에서 더 많은 가상머신 실행 가능
- CPU 유휴 시간 감소

**단점:**

- 보안 취약점 (Spectre, Meltdown)
- 싱글스레드 성능은 개선 없음
- 리소스 경쟁으로 인한 성능 저하 가능

**하이퍼스레딩 비활성화 (보안 강화)**

```bash
# BIOS에서 비활성화 또는
# 부팅 파라미터 추가
# /etc/default/grub
GRUB_CMDLINE_LINUX="nosmt"

# 런타임에 비활성화
echo off | sudo tee /sys/devices/system/cpu/smt/control
```

### 1.3 멀티 소켓과 NUMA

**멀티 소켓 시스템**

고성능 서버는 여러 개의 물리 CPU(소켓)를 장착할 수 있다.

```
2 소켓 시스템 예시:
- Socket 0: 16코어 (32 HT)
- Socket 1: 16코어 (32 HT)
- 총: 32 물리 코어, 64 논리 코어
```

**NUMA (Non-Uniform Memory Access)**

멀티 소켓 시스템에서 각 CPU는 **자신에게 가까운 메모리(로컬 메모리)**와 **다른 CPU의 메모리(원격 메모리)**에 접근할 수 있다.

```
        [CPU 0]───[메모리 0]
           │
           │  (interconnect)
           │
        [CPU 1]───[메모리 1]
```

- **로컬 메모리 접근**: 빠름 (100% 성능)
- **원격 메모리 접근**: 느림 (50-70% 성능)

**NUMA 확인**

```bash
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 0 size: 32GB
node 1 cpus: 8 9 10 11 12 13 14 15
node 1 size: 32GB
```

### 1.4 CPU 캐시

**캐시 계층 구조**

```
레지스터 (수 바이트) - 가장 빠름
    ↓
L1 캐시 (32-64KB) - 코어마다 독립
    ↓
L2 캐시 (256KB-1MB) - 코어마다 독립
    ↓
L3 캐시 (수MB-수십MB) - 모든 코어가 공유
    ↓
메인 메모리 (수GB-수TB) - 가장 느림
```

**캐시 정보 확인**

```bash
$ lscpu | grep cache
L1d cache:           256 KiB (8 instances)
L1i cache:           256 KiB (8 instances)
L2 cache:            2 MiB (8 instances)
L3 cache:            16 MiB (1 instance)
```

**캐시가 중요한 이유**

- CPU와 메모리 속도 차이는 약 100배
- 캐시 히트율이 성능에 결정적 영향
- 알고리즘 설계 시 캐시 친화적 패턴 고려 필요

---

## 2. 메모리 아키텍처

### 2.1 메모리 계층 구조

현대 컴퓨터의 메모리 시스템은 속도와 용량의 trade-off를 고려한 계층 구조로 설계되어 있다.

**메모리 계층 (Memory Hierarchy)**

```
레지스터 (Registers)
  - 크기: 수십 바이트
  - 속도: ~1 cycle (가장 빠름)
  - 위치: CPU 내부

L1 캐시 (L1 Cache)
  - 크기: 32-64 KB (코어당)
  - 속도: ~4 cycles
  - 분리: L1i (Instruction), L1d (Data)

L2 캐시 (L2 Cache)
  - 크기: 256 KB - 1 MB (코어당)
  - 속도: ~12 cycles
  - 코어 전용

L3 캐시 (L3 Cache)
  - 크기: 수 MB ~ 수십 MB
  - 속도: ~40 cycles
  - 모든 코어 공유

메인 메모리 (RAM)
  - 크기: 수 GB ~ 수 TB
  - 속도: ~100-300 cycles
  - DDR4/DDR5 DRAM

스토리지 (SSD/HDD)
  - 크기: 수 TB ~ 수 PB
  - 속도: ~100,000+ cycles (가장 느림)
  - 영구 저장
```

**메모리 계층의 원리**

- **Locality (지역성)**: 프로그램은 최근에 사용한 데이터를 다시 사용하는 경향 (시간적 지역성)
- **Spatial Locality (공간적 지역성)**: 접근한 데이터 주변의 데이터도 곧 접근할 가능성이 높음
- **Caching**: 자주 사용하는 데이터를 빠른 메모리에 복사하여 성능 향상

**메모리 접근 시간 비교**

```bash
# 대략적인 레이턴시 비교 (실제 값은 시스템마다 다름)
L1 캐시 참조:        0.5 ns
L2 캐시 참조:        7 ns
L3 캐시 참조:        20 ns
메인 메모리 참조:    100 ns
SSD 읽기:           150 μs (150,000 ns)
HDD 탐색:           10 ms (10,000,000 ns)
```

### 2.2 메모리 타입 (DDR3/DDR4/DDR5)

**DDR SDRAM (Double Data Rate Synchronous Dynamic RAM)**

현대 컴퓨터는 DDR 메모리를 주 메모리로 사용한다. DDR은 클럭 신호의 상승/하강 양쪽 엣지에서 데이터를 전송하여 성능을 향상시킨다.

**DDR3 (2007년 출시)**

```
전송 속도: 800-2133 MT/s (Mega Transfers per second)
동작 전압: 1.5V
대역폭: 6.4-17 GB/s (per module)
밀도: 최대 8GB per DIMM
용도: 구형 시스템, 레거시 서버
```

**DDR4 (2014년 출시)**

```
전송 속도: 1600-3200 MT/s
동작 전압: 1.2V (20% 절전)
대역폭: 12.8-25.6 GB/s
밀도: 최대 64GB per DIMM
추가 기능: Bank Grouping, On-Die ECC
용도: 현재 주류 (2024년 기준)
```

**DDR5 (2020년 출시)**

```
전송 속도: 3200-6400 MT/s (이상)
동작 전압: 1.1V
대역폭: 25.6-51.2 GB/s
밀도: 최대 128GB per DIMM
추가 기능: On-Die ECC (표준), Dual Channel per DIMM
용도: 최신 고성능 시스템
```

**DDR 세대 비교표**

| 항목           | DDR3      | DDR4      | DDR5       |
|--------------|-----------|-----------|------------|
| 최대 속도        | 2133 MT/s | 3200 MT/s | 6400+ MT/s |
| 전압           | 1.5V      | 1.2V      | 1.1V       |
| Prefetch     | 8n        | 8n        | 16n        |
| Max Capacity | 8GB       | 64GB      | 128GB      |
| ECC          | Optional  | Optional  | On-Die 표준  |

**메모리 속도 확인**

```bash
# 메모리 정보 확인
sudo dmidecode -t memory

# 메모리 타입 및 속도
sudo dmidecode -t memory | grep -E "Type:|Speed:"

# 예시 출력:
# Type: DDR4
# Speed: 3200 MT/s
# Type: DDR4
# Speed: 3200 MT/s
```

### 2.3 메모리 채널과 뱅크

**메모리 채널 (Memory Channel)**

CPU는 메모리 컨트롤러를 통해 메모리에 접근하며, 채널을 통해 병렬로 데이터를 전송한다.

**Single Channel vs Dual Channel vs Quad Channel**

```
Single Channel:
  CPU ──── [메모리 컨트롤러] ──── [DIMM]
  대역폭: 1x

Dual Channel:
  CPU ──── [메모리 컨트롤러] ──┬─ [DIMM1]
                            └─ [DIMM2]
  대역폭: 2x (이론상)
  실제: 1.5-1.8x 성능 향상

Quad Channel:
  CPU ──── [메모리 컨트롤러] ──┬─ [DIMM1]
                            ├─ [DIMM2]
                            ├─ [DIMM3]
                            └─ [DIMM4]
  대역폭: 4x (이론상)
  용도: 서버, 워크스테이션
```

**메모리 채널 확인**

```bash
# NUMA 노드별 메모리 구성 확인
numactl --hardware

# 메모리 슬롯 정보
sudo dmidecode -t memory | grep -E "Locator:|Size:|Bank"

# 예시:
# Locator: DIMM A1 (Channel 0)
# Bank Locator: BANK 0
# Size: 16 GB

# Locator: DIMM A2 (Channel 1)
# Bank Locator: BANK 1
# Size: 16 GB
```

**메모리 뱅크 (Memory Bank)**

메모리 모듈 내부는 여러 뱅크(Bank)로 나뉘어 있다. 뱅크는 독립적으로 동작할 수 있어 인터리빙(Interleaving)을 통해 성능을 향상시킨다.

**Bank Interleaving**

연속된 메모리 주소가 서로 다른 뱅크에 할당되어, 한 뱅크가 데이터를 준비하는 동안 다른 뱅크에서 데이터를 읽을 수 있다.

```
주소 0x0000 → Bank 0
주소 0x1000 → Bank 1
주소 0x2000 → Bank 2
주소 0x3000 → Bank 3
주소 0x4000 → Bank 0 (반복)
```

**메모리 성능 최적화 팁**

```bash
# Dual Channel 구성을 위해:
# - 같은 용량의 메모리를 쌍으로 설치
# - 색상이 같은 슬롯에 설치 (마더보드 매뉴얼 참조)
# - 예: DIMM A1 + DIMM B1 (16GB + 16GB)

# 잘못된 구성 (Single Channel):
# DIMM A1: 16GB
# DIMM A2: 16GB  ← 같은 채널

# 올바른 구성 (Dual Channel):
# DIMM A1: 16GB
# DIMM B1: 16GB  ← 다른 채널
```

**메모리 대역폭 측정**

```bash
# 메모리 대역폭 벤치마크 (sysbench 설치 필요)
sysbench memory --memory-block-size=1M --memory-total-size=10G run

# Stream 벤치마크
# https://www.cs.virginia.edu/stream/
gcc -O3 -fopenmp stream.c -o stream
./stream
```

**NUMA와 메모리 채널**

멀티 소켓 시스템에서는 각 CPU가 자신의 메모리 컨트롤러와 메모리 채널을 가진다.

```
┌──────────────┐              ┌──────────────┐
│   CPU 0      │              │   CPU 1      │
│  ┌────────┐  │              │  ┌────────┐  │
│  │Memory  │  │              │  │Memory  │  │
│  │Ctrl    │  │              │  │Ctrl    │  │
│  └────┬───┘  │              │  └────┬───┘  │
└───────┼──────┘              └───────┼──────┘
        │                             │
    ┌───┴────┐                    ┌───┴────┐
    │Memory 0│                    │Memory 1│
    │(Local) │                    │(Local) │
    └────────┘                    └────────┘
        │                             │
        └──────────Interconnect───────┘
           (Remote Access: 느림)
```

**메모리 정책 설정**

```bash
# 로컬 NUMA 노드의 메모리만 사용
numactl --membind=0 ./myapp

# CPU와 메모리를 같은 NUMA 노드로 제한
numactl --cpunodebind=0 --membind=0 ./myapp

# NUMA 정책 확인
numastat
```

---

## 3. 스토리지 시스템

### 3.1 스토리지 종류

**HDD (Hard Disk Drive)**

- **기계식**: 회전하는 플래터에 데이터 저장
- **속도**: 느림 (100-200 MB/s)
- **장점**: 저렴, 대용량
- **단점**: 물리적 충격에 약함, 소음
- **용도**: 대용량 백업, 아카이브

**SSD (Solid State Drive)**

- **전자식**: NAND 플래시 메모리
- **속도**: 빠름 (500-3500 MB/s)
- **인터페이스**: SATA, NVMe
- **장점**: 빠른 속도, 저전력, 무소음
- **단점**: 비쌈, 쓰기 수명 제한
- **용도**: OS 설치, 데이터베이스, 애플리케이션

**NVMe SSD**

- **인터페이스**: PCIe 직접 연결
- **속도**: 매우 빠름 (3000-7000 MB/s)
- **장점**: 최고 성능, 낮은 지연시간
- **용도**: 고성능 데이터베이스, 가상화

**스토리지 인터페이스 비교**

```
SATA III:    6 Gb/s  (실제: ~550 MB/s)
SAS:         12 Gb/s (실제: ~1200 MB/s)
NVMe Gen3:   32 Gb/s (실제: ~3500 MB/s)
NVMe Gen4:   64 Gb/s (실제: ~7000 MB/s)
```

### 3.2 RAID (Redundant Array of Independent Disks)

**RAID란?**

여러 개의 디스크를 하나로 묶어 **성능 향상** 또는 **데이터 보호**를 제공하는 기술이다.

**RAID 0 (Striping) - 성능**

```
┌──────┐  ┌──────┐
│Disk 0│  │Disk 1│
├──────┤  ├──────┤
│ A1   │  │ A2   │
│ B1   │  │ B2   │
│ C1   │  │ C2   │
└──────┘  └──────┘

파일 A = A1 + A2
```

- **장점**: 읽기/쓰기 속도 2배
- **단점**: **디스크 하나만 고장나도 모든 데이터 손실**
- **용량**: N개 디스크 = N배 용량
- **최소 디스크**: 2개
- **용도**: 임시 데이터, 캐시, 성능이 최우선

**RAID 1 (Mirroring) - 안전성**

```
┌──────┐  ┌──────┐
│Disk 0│  │Disk 1│
├──────┤  ├──────┤
│ A    │  │ A    │  (복사본)
│ B    │  │ B    │
│ C    │  │ C    │
└──────┘  └──────┘
```

- **장점**: 디스크 1개 고장나도 데이터 안전
- **단점**: 용량 50% 활용
- **용량**: N개 디스크 = 1배 용량 (나머지는 백업)
- **최소 디스크**: 2개
- **용도**: OS 디스크, 중요 데이터

**RAID 5 (Striping + Parity) - 균형**

```
┌──────┐  ┌──────┐  ┌──────┐
│Disk 0│  │Disk 1│  │Disk 2│
├──────┤  ├──────┤  ├──────┤
│ A1   │  │ A2   │  │ Ap   │  Parity
│ B1   │  │ Bp   │  │ B2   │
│ Cp   │  │ C1   │  │ C2   │
└──────┘  └──────┘  └──────┘

Ap = A1 XOR A2 (패리티)
```

- **장점**: 성능 향상 + 디스크 1개 고장 복구 가능
- **단점**: 쓰기 성능은 느림 (패리티 계산)
- **용량**: N개 디스크 = (N-1)배 용량
- **최소 디스크**: 3개
- **용도**: 범용 데이터 스토리지

**RAID 6 (Dual Parity)**

- RAID 5와 유사하지만 패리티를 2개 사용
- **디스크 2개까지 고장 복구 가능**
- 용량: (N-2)배
- 최소 디스크: 4개
- 용도: 대용량 스토리지, 안전성 중요

**RAID 10 (1+0, Mirrored Stripe)**

```
    ┌─────────RAID 0─────────┐
    │                        │
┌─RAID 1─┐            ┌─RAID 1─┐
│        │            │        │
Disk0  Disk1        Disk2  Disk3
```

- RAID 1로 미러링 후 RAID 0으로 스트라이핑
- **장점**: 빠른 성능 + 높은 안정성
- **단점**: 비용 (50% 용량 활용)
- **용량**: N/2배
- **최소 디스크**: 4개
- **용도**: 고성능 데이터베이스

**RAID 레벨 비교표**

| RAID | 최소 디스크 | 용량 효율   | 읽기 성능 | 쓰기 성능 | 장애 허용 | 용도         |
|------|--------|---------|-------|-------|-------|------------|
| 0    | 2      | 100%    | 높음    | 높음    | 불가    | 임시 데이터     |
| 1    | 2      | 50%     | 중간    | 낮음    | 1개    | OS, 중요 데이터 |
| 5    | 3      | (N-1)/N | 높음    | 낮음    | 1개    | 범용 스토리지    |
| 6    | 4      | (N-2)/N | 높음    | 낮음    | 2개    | 대용량 스토리지   |
| 10   | 4      | 50%     | 높음    | 높음    | N/2개  | 데이터베이스     |

### 3.3 RAID 구성 실습

**소프트웨어 RAID (mdadm)**

```bash
# mdadm 설치
apt install mdadm

# RAID 0 생성 (2개 디스크)
mdadm --create /dev/md0 --level=0 --raid-devices=2 /dev/sdb /dev/sdc

# RAID 1 생성
mdadm --create /dev/md1 --level=1 --raid-devices=2 /dev/sdb /dev/sdc

# RAID 5 생성 (3개 디스크)
mdadm --create /dev/md5 --level=5 --raid-devices=3 /dev/sdb /dev/sdc /dev/sdd

# RAID 상태 확인
cat /proc/mdstat
mdadm --detail /dev/md0

# RAID 정보 저장 (재부팅 후에도 유지)
mdadm --detail --scan >> /etc/mdadm/mdadm.conf

# 파일시스템 생성 및 마운트
mkfs.ext4 /dev/md0
mount /dev/md0 /mnt/raid

# 디스크 장애 시뮬레이션
mdadm --manage /dev/md1 --fail /dev/sdb
mdadm --manage /dev/md1 --remove /dev/sdb

# 새 디스크 추가
mdadm --manage /dev/md1 --add /dev/sde
```

**하드웨어 RAID**

- RAID 컨트롤러 카드 사용 (예: LSI MegaRAID)
- 성능이 더 좋고 CPU 사용률 낮음
- 비용이 높지만 엔터프라이즈 환경에서 선호

```bash
# MegaRAID 컨트롤러 정보 확인
megacli -AdpAllInfo -aALL
megacli -LDInfo -Lall -aALL
megacli -PDList -aALL
```

---

### 3.4 LVM (Logical Volume Manager)

**LVM이란?**

LVM은 물리 디스크를 논리적 볼륨으로 관리하는 Linux의 스토리지 관리 도구이다. 파티션의 한계를 극복하고 유연한 스토리지 관리를 제공한다.

**LVM의 장점**

- **동적 크기 조정**: 파티션 크기를 온라인으로 확장/축소 가능
- **논리적 구성**: 여러 물리 디스크를 하나의 논리 볼륨으로 통합
- **스냅샷**: 백업을 위한 시점 복사본 생성
- **Thin Provisioning**: 실제 사용량만큼만 공간 할당
- **마이그레이션**: 데이터 손실 없이 디스크 교체 가능

**LVM 구조**

```
┌─────────────────────────────────────────────┐
│ Logical Volume (LV) - 사용자가 사용하는 논리 볼륨 │
│ /dev/vg01/lv_data  /dev/vg01/lv_logs        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────┴──────────────────────────────┐
│ Volume Group (VG) - 물리 볼륨을 묶은 그룹      │
│ vg01 (총 용량: 200GB)                       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────┴──────────────────────────────┐
│ Physical Volume (PV) - 물리 디스크 또는 파티션 │
│ /dev/sdb1 (100GB)  /dev/sdc1 (100GB)       │
└─────────────────────────────────────────────┘
```

**주요 개념**

**PV (Physical Volume)**

- 실제 물리 디스크 또는 파티션
- LVM이 사용할 수 있도록 초기화된 블록 디바이스
- 예: `/dev/sdb1`, `/dev/sdc`

**VG (Volume Group)**

- 여러 PV를 묶은 논리적 스토리지 풀
- VG에서 LV를 생성
- 예: `vg01`, `vg_data`

**LV (Logical Volume)**

- VG에서 할당된 논리 볼륨
- 파일시스템을 생성하고 마운트하는 대상
- 예: `/dev/vg01/lv_data`, `/dev/mapper/vg01-lv_data`

**PE (Physical Extent)**

- PV를 나누는 최소 단위 (기본 4MB)
- LVM의 allocation unit

**LE (Logical Extent)**

- LV를 구성하는 단위
- PE와 1:1 매핑

**LVM 생성 실습**

**1단계: Physical Volume 생성**

```bash
# 디스크 확인
lsblk

# PV 생성
pvcreate /dev/sdb
pvcreate /dev/sdc

# PV 확인
pvs
pvdisplay /dev/sdb

# 예시 출력:
#   PV Name               /dev/sdb
#   VG Name
#   PV Size               100.00 GiB
#   Allocatable           yes
#   PE Size               4.00 MiB
#   Total PE              25599
#   Free PE               25599
```

**2단계: Volume Group 생성**

```bash
# VG 생성 (sdb와 sdc를 묶음)
vgcreate vg_data /dev/sdb /dev/sdc

# VG 확인
vgs
vgdisplay vg_data

# 예시 출력:
#   VG Name               vg_data
#   System ID
#   Format                lvm2
#   VG Size               199.99 GiB
#   PE Size               4.00 MiB
#   Total PE              51198
#   Free  PE              51198

# VG에 PV 추가
vgextend vg_data /dev/sdd
```

**3단계: Logical Volume 생성**

```bash
# LV 생성 (50GB)
lvcreate -L 50G -n lv_app vg_data

# 또는 % 단위로 생성
lvcreate -l 100%FREE -n lv_data vg_data  # 남은 공간 전부 사용

# LV 확인
lvs
lvdisplay /dev/vg_data/lv_app

# 파일시스템 생성
mkfs.ext4 /dev/vg_data/lv_app

# 마운트
mkdir /mnt/app
mount /dev/vg_data/lv_app /mnt/app

# /etc/fstab 추가 (재부팅 후에도 자동 마운트)
echo "/dev/vg_data/lv_app  /mnt/app  ext4  defaults  0 2" >> /etc/fstab
```

**LVM 크기 조정 (확장)**

**온라인 확장 (시스템 중단 없이)**

```bash
# 1. LV 확장 (50GB → 80GB)
lvextend -L 80G /dev/vg_data/lv_app

# 또는 증분으로
lvextend -L +30G /dev/vg_data/lv_app

# 2. 파일시스템 확장
# ext4
resize2fs /dev/vg_data/lv_app

# xfs
xfs_growfs /mnt/app

# 한 번에 하기 (LV + 파일시스템)
lvextend -L 80G -r /dev/vg_data/lv_app
```

**LVM 크기 조정 (축소) - 주의 필요**

```bash
# 경고: 데이터 손실 위험이 있으므로 반드시 백업
# XFS는 축소 불가, ext4만 가능

# 1. 파일시스템 언마운트
umount /mnt/app

# 2. 파일시스템 체크
e2fsck -f /dev/vg_data/lv_app

# 3. 파일시스템 축소 (80GB → 40GB)
resize2fs /dev/vg_data/lv_app 40G

# 4. LV 축소
lvreduce -L 40G /dev/vg_data/lv_app

# 5. 다시 마운트
mount /dev/vg_data/lv_app /mnt/app
```

**Thin Provisioning**

Thin Provisioning은 실제 사용량보다 큰 볼륨을 할당하되, 실제로는 사용한 만큼만 공간을 소비하는 기술이다.

**Thin Provisioning의 장점**

- **Over-provisioning**: 물리 용량보다 많은 논리 볼륨 생성 가능
- **공간 효율성**: 실제 사용량만큼만 공간 할당
- **빠른 프로비저닝**: 큰 볼륨도 즉시 생성 가능
- **스냅샷 효율성**: Thin 스냅샷은 공간을 거의 사용하지 않음

**Thin Pool 생성**

```bash
# Thin Pool 생성 (100GB)
lvcreate -L 100G --thinpool thin_pool vg_data

# Thin Pool 메타데이터 확장 (선택 사항)
lvextend --poolmetadatasize +10M vg_data/thin_pool

# Thin Volume 생성 (200GB 할당, 하지만 실제로는 사용량만큼만 차지)
lvcreate -V 200G --thin -n thin_vol1 vg_data/thin_pool
lvcreate -V 200G --thin -n thin_vol2 vg_data/thin_pool

# 파일시스템 생성
mkfs.ext4 /dev/vg_data/thin_vol1
mkfs.ext4 /dev/vg_data/thin_vol2

# 마운트
mount /dev/vg_data/thin_vol1 /mnt/thin1
mount /dev/vg_data/thin_vol2 /mnt/thin2

# Thin Pool 상태 확인
lvs -a vg_data
#   LV         VG      Attr       LSize   Pool      Origin Data%
#   thin_pool  vg_data twi-aotz-- 100.00g                  15.24
#   thin_vol1  vg_data Vwi-aotz-- 200.00g thin_pool        8.50
#   thin_vol2  vg_data Vwi-aotz-- 200.00g thin_pool        6.74
```

**Thin Provisioning 모니터링**

```bash
# Thin Pool 사용률 모니터링 (중요)
lvs -a -o +data_percent,metadata_percent

# 경고: Data% 또는 Metadata%가 80%를 넘으면 확장 필요
# Thin Pool 확장
lvextend -L +50G /dev/vg_data/thin_pool
```

**LVM 스냅샷**

스냅샷은 특정 시점의 LV 복사본을 생성하는 기능이다. 주로 백업 전에 일관된 상태를 유지하기 위해 사용한다.

**전통적 스냅샷 (Thick Snapshot)**

```bash
# 스냅샷 생성 (10GB 공간 할당)
lvcreate -L 10G -s -n snap_app /dev/vg_data/lv_app

# 스냅샷 확인
lvs -a
#   LV       VG      Attr       LSize  Pool Origin Data%
#   lv_app   vg_data owi-aos--- 50.00g
#   snap_app vg_data swi-a-s--- 10.00g      lv_app 0.02

# 스냅샷 마운트 (읽기 전용 권장)
mkdir /mnt/snap
mount -o ro /dev/vg_data/snap_app /mnt/snap

# 백업 수행
tar czf /backup/app_backup.tar.gz /mnt/snap

# 스냅샷 삭제
umount /mnt/snap
lvremove /dev/vg_data/snap_app
```

**Thin 스냅샷 (권장)**

Thin 스냅샷은 공간을 거의 사용하지 않으며, 여러 스냅샷을 효율적으로 관리할 수 있다.

```bash
# Thin Volume의 스냅샷 생성
lvcreate -s -n thin_snap1 /dev/vg_data/thin_vol1

# 스냅샷 확인
lvs -a
#   LV         VG      Attr       LSize   Pool      Origin    Data%
#   thin_vol1  vg_data Vwi-aotz-- 200.00g thin_pool           8.50
#   thin_snap1 vg_data Vwi-a-tz-k 200.00g thin_pool thin_vol1 0.00

# 여러 스냅샷 생성 가능 (공간 효율적)
lvcreate -s -n thin_snap2 /dev/vg_data/thin_vol1
lvcreate -s -n thin_snap3 /dev/vg_data/thin_vol1
```

**스냅샷 활용 사례**

**1. 안전한 시스템 업그레이드**

```bash
# 업그레이드 전 스냅샷
lvcreate -s -n before_upgrade /dev/vg_data/lv_root

# 업그레이드 수행
apt upgrade -y

# 문제 발생 시 롤백
lvconvert --merge /dev/vg_data/before_upgrade
reboot
```

**2. 일관된 백업**

```bash
# 백업 스크립트
#!/bin/bash
# DB를 flush하고 스냅샷 생성
mysql -e "FLUSH TABLES WITH READ LOCK;"
lvcreate -s -n db_snap /dev/vg_data/lv_mysql
mysql -e "UNLOCK TABLES;"

# 스냅샷 마운트 및 백업
mount -o ro /dev/vg_data/db_snap /mnt/snap
rsync -av /mnt/snap/ /backup/mysql/

# 정리
umount /mnt/snap
lvremove -f /dev/vg_data/db_snap
```

**3. 개발/테스트 환경**

```bash
# 프로덕션 데이터의 스냅샷으로 테스트 환경 생성
lvcreate -s -n test_db /dev/vg_data/prod_db
mount /dev/vg_data/test_db /mnt/test

# 테스트 완료 후 삭제
umount /mnt/test
lvremove -f /dev/vg_data/test_db
```

**LVM 상태 모니터링**

```bash
# 전체 LVM 상태 요약
pvs
vgs
lvs

# 상세 정보
pvdisplay
vgdisplay
lvdisplay

# I/O 통계
dmstats list
dmstats report

# LVM 디스크 사용량
lvs -o +data_percent,metadata_percent,pool_lv
```

**LVM Best Practices**

**1. /var/lib/docker를 별도 LV로 분리**

```bash
# Docker 데이터용 LV 생성
lvcreate -L 100G -n lv_docker vg_data
mkfs.xfs /dev/vg_data/lv_docker

# Docker 중지
systemctl stop docker

# 기존 데이터 복사
mount /dev/vg_data/lv_docker /mnt
rsync -av /var/lib/docker/ /mnt/
umount /mnt

# 마운트 및 Docker 재시작
mount /dev/vg_data/lv_docker /var/lib/docker
systemctl start docker

# /etc/fstab에 추가
echo "/dev/vg_data/lv_docker  /var/lib/docker  xfs  defaults  0 2" >> /etc/fstab
```

**2. Thin Provisioning 사용 (컨테이너 환경)**

```bash
# Docker용 Thin Pool 생성
lvcreate -L 200G --thinpool docker_pool vg_data

# Docker에서 devicemapper 스토리지 드라이버 설정
# /etc/docker/daemon.json
{
  "storage-driver": "devicemapper",
  "storage-opts": [
    "dm.thinpooldev=/dev/mapper/vg_data-docker_pool",
    "dm.use_deferred_removal=true",
    "dm.use_deferred_deletion=true"
  ]
}

# 참고: 최신 Docker는 overlay2 권장, devicemapper는 레거시
```

**3. 정기적인 백업**

```bash
# cron으로 매일 스냅샷 백업
# /etc/cron.daily/lvm-backup.sh
#!/bin/bash
SNAP_NAME="daily_$(date +%Y%m%d)"
lvcreate -s -n $SNAP_NAME /dev/vg_data/lv_important
# 백업 수행
# ...
# 오래된 스냅샷 정리 (7일 이상)
```

**LVM 문제 해결**

```bash
# LV가 활성화되지 않을 때
lvchange -ay /dev/vg_data/lv_app

# VG 메타데이터 백업
vgcfgbackup vg_data

# VG 메타데이터 복원
vgcfgrestore vg_data

# PV 스캔 및 재구성
pvscan
vgscan
lvscan

# 손상된 LVM 메타데이터 복구
vgck vg_data
```

---

## 4. 운영체제와 커널

### 4.1 운영체제의 역할

운영체제(Operating System)는 하드웨어 자원을 효율적으로 관리하고, 애플리케이션에게 안정적인 실행 환경을 제공하는 시스템 소프트웨어이다.

**주요 역할:**

- **자원 관리**: CPU, 메모리, 디스크, 네트워크 등의 하드웨어 자원을 여러 프로세스가 공유할 수 있도록 관리
- **추상화 제공**: 복잡한 하드웨어를 간단한 인터페이스로 추상화하여 애플리케이션 개발 용이성 제공
- **보안과 격리**: 프로세스 간 격리를 통해 시스템 안정성과 보안 보장
- **효율성 극대화**: 자원의 효율적 사용을 통한 시스템 성능 최적화

### 4.2 Kernel Space vs User Space

리눅스는 보안과 안정성을 위해 CPU 실행 모드를 두 가지로 분리한다.

**User Space (사용자 공간)**

사용자 공간은 일반 애플리케이션이 실행되는 영역이다:

- **제한된 명령어 실행**: CPU의 일부 명령어만 사용 가능하며, 특권 명령어는 실행할 수 없다
- **메모리 보호**: 각 프로세스는 독립된 가상 메모리 공간을 가지며, 다른 프로세스의 메모리에 접근할 수 없다
- **하드웨어 접근 제한**: 디스크, 네트워크 카드 등의 하드웨어에 직접 접근할 수 없다
- **시스템 콜 의존성**: 커널의 기능을 사용하려면 반드시 시스템 콜(System Call)을 통해야 한다

**Kernel Space (커널 공간)**

커널 공간은 운영체제의 주요 기능이 실행되는 영역으로, 최고 권한을 가진다:

- **모든 명령어 실행**: CPU의 모든 명령어를 제한 없이 실행할 수 있다
- **전체 메모리 접근**: 물리 메모리의 모든 영역에 접근 가능하다
- **하드웨어 직접 제어**: 모든 하드웨어 장치를 직접 제어할 수 있다
- **시스템 자원 관리**: 프로세스 스케줄링, 메모리 관리, 파일 시스템 등 주요 기능 수행

**모드 전환 (Mode Switching)**

사용자 프로그램이 파일을 읽거나 네트워크 통신을 하려면 커널의 도움이 필요한다. 이때 CPU는 사용자 모드에서 커널 모드로 전환된다:

1. 사용자 프로그램이 시스템 콜 요청
2. CPU가 사용자 모드에서 커널 모드로 전환
3. 커널이 요청된 작업 수행
4. CPU가 다시 사용자 모드로 전환
5. 결과를 사용자 프로그램에 반환

이러한 모드 전환은 성능 오버헤드를 발생시키지만, 시스템의 안정성과 보안을 위해 필수적이다.

### 4.3 Monolithic Kernel 아키텍처

리눅스는 **Monolithic Kernel(단일형 커널)** 구조를 채택하고 있다. 이는 운영체제의 모든 주요 기능이 하나의 큰 프로그램으로 커널 공간에서 실행되는 방식이다.

**Monolithic Kernel의 구성 요소**

리눅스 커널은 다음과 같은 주요 서브시스템으로 구성된다:

- **프로세스 관리**: 프로세스 생성, 종료, 스케줄링 담당
- **메모리 관리**: 가상 메모리, 페이징, 스왑 관리
- **파일 시스템**: VFS(Virtual File System) 계층과 실제 파일 시스템(ext4, xfs 등) 구현
- **네트워크 스택**: TCP/IP 프로토콜 스택, 소켓 인터페이스
- **디바이스 드라이버**: 하드웨어 장치 제어 코드

**장점**

- **고성능**: 모든 컴포넌트가 같은 메모리 공간에서 실행되어 함수 호출로 직접 통신할 수 있다
- **효율적 자원 공유**: 커널의 모든 부분이 메모리와 CPU 캐시를 효율적으로 공유한다
- **통합 최적화**: 전체 시스템을 하나의 단위로 보고 최적화할 수 있다

**단점**

- **큰 코드베이스**: 전체 커널 이미지 크기가 크고 복잡한다
- **안정성 위험**: 디바이스 드라이버 하나의 버그가 전체 시스템을 다운시킬 수 있다
- **개발 난이도**: 새로운 기능 추가 시 커널 전체에 대한 이해가 필요한다

**커널 모듈 시스템**

리눅스는 Monolithic 구조의 단점을 보완하기 위해 **동적 모듈 로딩(Dynamic Module Loading)** 메커니즘을 제공한다:

- 필요한 드라이버만 런타임에 로드하여 메모리 절약
- 시스템 재부팅 없이 드라이버 업데이트 가능
- 커널 재컴파일 없이 새로운 기능 추가 가능

---

## 5. 시스템 콜과 인터럽트

### 5.1 System Call의 이해

시스템 콜(System Call)은 **사용자 프로그램이 커널 기능을 요청하는 유일한 인터페이스**이다. 파일 I/O, 네트워크 통신, 프로세스 생성 등 모든 특권 작업은 시스템 콜을 통해서만 가능하다.

**시스템 콜의 필요성**

사용자 프로그램은 보안과 안정성을 위해 하드웨어에 직접 접근할 수 없다:

- 파일을 읽으려면 디스크 컨트롤러에 직접 명령을 내릴 수 없다
- 네트워크 패킷을 보내려면 네트워크 카드를 직접 제어할 수 없다
- 다른 프로세스의 메모리를 읽거나 쓸 수 없다

따라서 이러한 작업은 커널에 요청해야 하며, 이 요청 메커니즘이 바로 시스템 콜이다.

**시스템 콜 실행 과정**

**1단계: 사용자 프로그램의 요청**

사용자 프로그램이 `open()` 함수를 호출하여 파일 열기를 요청한다.

**2단계: C 라이브러리 래퍼 함수**

`open()` 함수는 실제로는 glibc가 제공하는 래퍼 함수이다. 이 함수는:

- 시스템 콜 번호를 레지스터에 설정
- 함수 인자들을 정해진 레지스터에 배치
- 특수 CPU 명령어 실행

**3단계: 트랩 발생 및 모드 전환**

특수 CPU 명령어가 실행되면:

- CPU는 즉시 사용자 모드에서 커널 모드로 전환
- 현재 프로그램의 실행 상태를 저장
- 커널의 시스템 콜 핸들러로 제어권 이동

**4단계: 커널의 시스템 콜 처리**

커널은 다음 작업을 수행한다:

- 사용자 공간의 파일명을 커널 공간으로 복사
- 권한 검사 (파일 접근 권한이 있는가?)
- 파일 시스템에서 파일 찾기
- 파일 디스크립터 할당
- 파일 열기 작업 수행
- 파일 디스크립터 번호 반환

**5단계: 사용자 모드로 복귀**

- 커널이 작업 완료 후 결과를 레지스터에 저장
- CPU가 커널 모드에서 사용자 모드로 다시 전환
- 저장했던 프로그램 상태 복원
- 사용자 프로그램의 다음 명령어부터 계속 실행

**주요 시스템 콜 카테고리**

**파일 및 I/O 시스템 콜**

- `open()`: 파일 열기
- `read()`: 파일 읽기
- `write()`: 파일 쓰기
- `close()`: 파일 닫기
- `lseek()`: 파일 오프셋 이동
- `ioctl()`: 디바이스 제어

**프로세스 관리 시스템 콜**

- `fork()`: 새 프로세스 생성
- `exec()`: 프로그램 실행
- `exit()`: 프로세스 종료
- `wait()`: 자식 프로세스 대기
- `getpid()`: 프로세스 ID 조회

**메모리 관리 시스템 콜**

- `mmap()`: 메모리 매핑
- `munmap()`: 메모리 매핑 해제
- `brk()`: 힙 메모리 크기 조정
- `mprotect()`: 메모리 보호 속성 변경

**네트워크 시스템 콜**

- `socket()`: 소켓 생성
- `bind()`: 소켓에 주소 바인딩
- `listen()`: 연결 대기
- `accept()`: 연결 수락
- `connect()`: 서버에 연결
- `send()`/`recv()`: 데이터 송수신

### 5.2 Interrupt와 Exception

시스템 콜 외에도 CPU의 정상적인 실행 흐름을 중단시키는 메커니즘이 두 가지 더 있다.

**Interrupt (인터럽트)**

인터럽트는 **하드웨어 장치**가 CPU에게 보내는 비동기적 신호이다:

- **타이머 인터럽트**: 일정 시간마다 발생하여 프로세스 스케줄링에 사용
- **키보드 인터럽트**: 키보드 입력 발생 시
- **네트워크 인터럽트**: 네트워크 패킷 수신 시
- **디스크 인터럽트**: 디스크 I/O 완료 시

인터럽트가 발생하면 CPU는 현재 작업을 중단하고 해당 인터럽트를 처리하는 **인터럽트 핸들러(Interrupt Handler)**를 실행한다.

**Exception (예외)**

예외는 **소프트웨어 실행 중** 발생하는 동기적 이벤트이다:

- **Page Fault**: 접근하려는 메모리 페이지가 물리 메모리에 없을 때
- **Division by Zero**: 0으로 나누기 시도
- **Invalid Opcode**: 잘못된 기계어 명령 실행
- **Protection Fault**: 권한 없는 메모리 접근 시도
- **System Call**: 사용자 프로그램이 의도적으로 발생시키는 예외

**인터럽트 처리의 중요성**

인터럽트 처리는 시스템 성능에 직접적인 영향을 미친다:

- **Top Half (상위 절반)**: 긴급하고 중요한 작업만 빠르게 처리
- **Bottom Half (하위 절반)**: 나머지 작업은 나중에 천천히 처리

이러한 분리는 인터럽트 처리 시간을 최소화하여 시스템 응답성을 향상시킨다.

### 5.3 C 표준 라이브러리 (glibc)

**glibc(GNU C Library)**는 리눅스 시스템에서 가장 널리 사용되는 C 표준 라이브러리이다.

**glibc의 역할**

glibc는 시스템 콜과 사용자 프로그램 사이의 중간 계층으로 작동한다:

**시스템 콜 래핑**

사용자가 `read()` 함수를 호출하면, glibc 내부에서는 레지스터 설정, syscall 명령 실행 등의 복잡한 과정을 추상화한다. 사용자는 간단한 함수 호출만으로 시스템 콜을 사용할 수 있다.

**표준 C 함수 제공**

glibc는 POSIX 및 C 표준에서 정의한 수백 개의 함수를 제공한다:

- **문자열 처리**: `strlen()`, `strcpy()`, `strcmp()` 등
- **메모리 관리**: `malloc()`, `free()`, `calloc()` 등
- **파일 I/O**: `fopen()`, `fread()`, `fwrite()` 등
- **수학 함수**: `sin()`, `cos()`, `sqrt()` 등

**버퍼링 최적화**

glibc는 성능 향상을 위해 I/O 버퍼링을 수행한다. `fwrite()`는 내부 버퍼에 데이터를 모았다가 버퍼가 가득 차면 한 번에 시스템 콜을 호출한다. 이를 통해 시스템 콜 호출 횟수를 줄여 성능을 크게
향상시킨다.

**Thread-Local Storage**

glibc는 멀티스레드 환경에서 각 스레드가 독립적인 변수를 가질 수 있도록 지원한다. 예를 들어 `errno`는 스레드별로 독립적인 값을 가진다.

**동적 링킹**

대부분의 프로그램은 glibc를 동적으로 링크한다. 이는 메모리 효율성과 업데이트 용이성을 제공한다.

---

## 6. 메모리 관리

### 6.1 Virtual Memory (가상 메모리)

가상 메모리는 현대 운영체제의 가장 중요한 추상화 중 하나이다. 이를 통해 각 프로세스는 마치 전체 메모리를 독점하는 것처럼 동작할 수 있다.

**가상 메모리의 주요 개념**

**프로세스별 독립 주소 공간**

각 프로세스는 자신만의 가상 주소 공간을 갖는다. 예를 들어, 프로세스 A와 프로세스 B가 모두 가상 주소 `0x1000`을 사용할 수 있지만, 이들은 서로 다른 물리 메모리를 가리킨다.

이를 통해:

- 프로세스 간 메모리 격리 보장
- 프로세스가 다른 프로세스의 메모리를 침범할 수 없음
- 시스템 안정성과 보안성 향상

**주소 공간의 구조**

64비트 시스템에서 각 프로세스는 이론적으로 2^64 바이트의 주소 공간을 가진다. 실제로는 커널이 일부 영역을 예약하고, 나머지를 다음과 같이 나눈다:

**Text 영역 (코드 세그먼트)**

- 실행 가능한 기계어 코드 저장
- 읽기 전용으로 보호되어 실수로 코드를 덮어쓰는 것 방지
- 여러 프로세스가 같은 프로그램을 실행할 때 공유 가능

**Data 영역**

- 초기화된 전역 변수와 정적 변수
- 읽기/쓰기 가능
- 프로그램 시작 시 크기 고정

**BSS 영역**

- 초기화되지 않은 전역 변수와 정적 변수
- 프로그램 로딩 시 0으로 초기화
- 디스크 공간 절약을 위해 실행 파일에는 크기만 기록

**Heap 영역**

- 동적 메모리 할당 영역 (`malloc()`, `new` 등)
- 프로그램 실행 중 크기가 동적으로 변함
- 낮은 주소에서 높은 주소로 성장

**Stack 영역**

- 함수 호출 정보, 지역 변수, 함수 매개변수 저장
- 높은 주소에서 낮은 주소로 성장
- 함수 호출 시 증가, 반환 시 감소

### 6.2 Paging과 Page Table

**페이징 메커니즘**

가상 메모리를 실제 물리 메모리로 변환하는 주요 메커니즘이 **페이징(Paging)**이다.

**페이지와 페이지 프레임**

- **페이지(Page)**: 가상 메모리를 고정 크기(보통 4KB)로 나눈 단위
- **페이지 프레임(Page Frame)**: 물리 메모리를 같은 크기로 나눈 단위

**Page Table (페이지 테이블)**

페이지 테이블은 가상 페이지 번호를 물리 페이지 프레임 번호로 변환하는 자료구조이다. 가상 주소는 페이지 번호와 페이지 내 오프셋으로 구성되고, Page Table을 조회하여 물리 주소의 프레임 번호와 오프셋으로
변환된다.

**Multi-level Page Table**

64비트 시스템에서는 주소 공간이 너무 커서 단일 페이지 테이블로는 메모리 낭비가 심한다. 따라서 다단계 페이지 테이블을 사용한다:

- x86-64는 4단계 페이지 테이블 사용
- 실제로 사용하는 메모리 영역만 페이지 테이블 생성
- 메모리 효율성 크게 향상

**TLB (Translation Lookaside Buffer)**

페이지 테이블 조회는 메모리 접근이 필요하므로 느리다. 이를 해결하기 위해 CPU에 **TLB**라는 캐시를 둔다:

- 최근 사용한 페이지 변환 정보를 저장
- CPU 내부 캐시로 매우 빠른 접근
- TLB hit rate가 90% 이상이면 성능 크게 향상

### 6.3 Page Fault

**Page Fault의 개념**

프로세스가 접근하려는 가상 페이지가 물리 메모리에 없을 때 **Page Fault**가 발생한다. 이는 예외(Exception)의 일종으로, 커널이 처리한다.

**Page Fault의 종류**

**Minor Page Fault**

페이지가 물리 메모리에는 있지만 프로세스의 페이지 테이블에 매핑되지 않은 경우:

- 공유 라이브러리 페이지가 이미 다른 프로세스에 의해 로드된 경우
- Copy-on-Write로 인해 읽기 전용으로 공유 중인 페이지

처리가 빠르며 디스크 I/O가 필요 없다.

**Major Page Fault**

페이지가 물리 메모리에 없어서 디스크에서 읽어와야 하는 경우:

- 처음 파일을 메모리에 매핑할 때
- 스왑 아웃된 페이지를 다시 읽어올 때

디스크 I/O가 필요하므로 매우 느리다.

**Demand Paging**

리눅스는 **Demand Paging** 전략을 사용한다:

- 프로그램 실행 시 모든 코드를 메모리에 로드하지 않음
- 실제로 접근할 때만 페이지를 로드
- 메모리 효율성 향상

**Copy-on-Write (CoW)**

`fork()` 시스템 콜로 자식 프로세스를 생성할 때, 부모의 모든 메모리를 복사하지 않고:

- 처음에는 부모와 자식이 같은 물리 페이지를 공유 (읽기 전용)
- 둘 중 하나가 메모리를 수정하려고 할 때 Page Fault 발생
- 그때 비로소 해당 페이지만 복사

이를 통해 `fork()` 성능이 크게 향상된다.

### 6.4 Page Cache

**Page Cache의 역할**

Page Cache는 **파일 시스템 I/O 성능을 극적으로 향상**시키는 커널의 메모리 캐시 영역이다.

**작동 원리**

파일을 읽을 때:

1. 커널은 먼저 Page Cache를 확인
2. 캐시에 데이터가 있으면 즉시 반환 (디스크 I/O 없음)
3. 캐시에 없으면 디스크에서 읽고 Page Cache에 저장

파일을 쓸 때:

1. 데이터를 Page Cache에 먼저 저장 (Write-back)
2. 나중에 백그라운드에서 실제 디스크에 기록
3. 쓰기 작업이 즉시 완료된 것처럼 보임

**컨테이너 환경에서의 Page Cache**

중요한 점은 Page Cache는 **호스트 전체가 공유**한다는 것이다:

- 컨테이너 A가 파일을 읽어 Page Cache에 저장
- 컨테이너 B가 같은 파일을 읽으면 캐시 히트
- 이는 컨테이너 간 성능 간섭의 원인이 될 수 있음

**메모리 회수**

Page Cache는 "사용 가능한" 메모리로 간주된다:

- 시스템에 메모리가 부족하면 Page Cache를 회수
- 더티 페이지(수정된 페이지)는 먼저 디스크에 기록 후 회수
- 깨끗한 페이지는 즉시 회수 가능

### 3.5 Swap과 OOM Killer

**Swap 메모리**

Swap은 물리 메모리가 부족할 때 디스크 공간을 메모리처럼 사용하는 메커니즘이다.

**Swap의 작동**

1. 물리 메모리가 부족해지면 커널이 메모리 회수 시작
2. 자주 사용하지 않는 페이지를 스왑 공간으로 이동
3. 나중에 해당 페이지 접근 시 Major Page Fault 발생
4. 디스크에서 다시 메모리로 읽어옴

**Swappiness 설정**

Swappiness 값은 시스템이 얼마나 적극적으로 스왑을 사용할지 결정한다:

- 값이 높을수록 적극적으로 스왑 사용
- 값이 낮을수록 메모리를 더 오래 유지
- 컨테이너 환경에서는 보통 낮은 값 권장 (0-10)

**OOM Killer (Out Of Memory Killer)**

물리 메모리와 스왑이 모두 고갈되면 **OOM Killer**가 활성화된다.

**OOM Killer의 작동**

1. 커널이 메모리 부족 상황 감지
2. 각 프로세스의 OOM Score 계산
3. 점수가 가장 높은 프로세스 강제 종료
4. 메모리 확보 후 시스템 계속 동작

**OOM Score 계산**

OOM Score는 다음 요소를 고려한다:

- 메모리 사용량 (많이 사용할수록 점수 높음)
- 프로세스 실행 시간 (짧을수록 점수 높음)
- nice 값 (우선순위가 낮을수록 점수 높음)
- root 프로세스인지 여부 (일반 프로세스가 점수 높음)

**컨테이너와 OOM**

컨테이너에 메모리 제한을 설정하면:

- 컨테이너가 제한을 초과할 때 OOM Killer가 컨테이너 내에서만 작동
- 호스트 시스템 전체에 영향을 주지 않음
- 이것이 Cgroup의 중요한 역할 중 하나

### 3.6 NUMA (Non-Uniform Memory Access)

**NUMA의 개념**

현대의 멀티소켓 서버에서는 각 CPU 소켓이 자신만의 메모리를 가지며, 다른 소켓의 메모리에 접근할 때 성능 저하가 발생한다.

**NUMA 구조**

- **로컬 메모리**: 같은 소켓의 메모리 - 빠른 접근
- **원격 메모리**: 다른 소켓의 메모리 - 느린 접근 (2-3배 지연)

**NUMA 정책**

리눅스는 여러 NUMA 정책을 제공한다:

- **NUMA_LOCAL**: 현재 노드의 메모리 우선 할당
- **NUMA_INTERLEAVE**: 여러 노드에 균등 분산
- **NUMA_BIND**: 특정 노드에만 할당

**컨테이너와 NUMA**

컨테이너 오케스트레이터는 NUMA 인식 스케줄링을 통해:

- 같은 NUMA 노드의 CPU와 메모리를 함께 할당
- 크로스 노드 메모리 접근 최소화
- 성능 최적화

---

## 7. 프로세스 관리

### 7.1 프로세스와 스레드

**프로세스의 개념**

프로세스(Process)는 **실행 중인 프로그램의 인스턴스**이다. 운영체제가 자원을 할당하는 기본 단위이며, 다음을 포함한다:

- 독립적인 가상 메모리 주소 공간
- 프로그램 코드 (Text 영역)
- 데이터 영역 (전역 변수, 힙, 스택)
- 파일 디스크립터 테이블
- 시그널 핸들러 정보
- 환경 변수

**프로세스 제어 블록 (PCB)**

커널은 각 프로세스의 정보를 **PCB(Process Control Block)**에 저장한다:

- PID (Process ID)
- 프로세스 상태 (실행, 대기, 중단 등)
- CPU 레지스터 값
- 메모리 관리 정보 (페이지 테이블 포인터)
- I/O 상태 정보
- 스케줄링 정보

**스레드의 개념**

스레드(Thread)는 프로세스 내의 실행 흐름 단위이다. 앞서 설명한 CPU의 하드웨어 스레드와는 다른 개념이다.

**스레드의 종류**

1. **하드웨어 스레드 (Hardware Thread)**

- CPU 레벨의 개념
- 하이퍼스레딩으로 생성되는 논리 코어
- 물리적 실행 유닛을 공유

2. **소프트웨어 스레드 (Software Thread)**

- 운영체제/애플리케이션 레벨의 개념
- 프로세스 내부의 실행 흐름
- 이 섹션에서 다루는 내용

**소프트웨어 스레드의 특징**

- 같은 프로세스의 스레드들은 메모리 공간(코드, 데이터, 힙)을 공유
- 각 스레드는 독립적인 스택을 가짐
- 각 스레드는 독립적인 레지스터 세트를 가짐
- 프로세스보다 생성/전환 비용이 훨씬 저렴
- 여러 소프트웨어 스레드가 하나의 하드웨어 스레드(논리 코어)에서 실행될 수 있음

**멀티스레딩의 장점**

- **자원 공유**: 메모리를 공유하여 프로세스 간 통신(IPC)보다 효율적
- **응답성**: 한 스레드가 블록되어도 다른 스레드는 계속 실행
- **경제성**: 컨텍스트 스위칭 비용이 프로세스보다 훨씬 낮음
- **확장성**: 멀티코어 CPU를 효과적으로 활용

**멀티스레딩의 단점**

- **동기화 문제**: Race condition, Deadlock 등의 복잡한 문제
- **디버깅 어려움**: 비결정적 동작으로 버그 재현이 어려움
- **보안 위험**: 한 스레드의 버그가 전체 프로세스에 영향

### 7.2 프로세스 생성: Fork와 Exec

**Fork 시스템 콜**

`fork()`는 **현재 프로세스의 복사본을 생성**하는 시스템 콜이다.

**Fork의 작동 원리**

1. 커널이 새로운 PCB 생성
2. 부모 프로세스의 메모리 공간을 자식에게 복사 (실제로는 CoW)
3. 파일 디스크립터 테이블 복사
4. 부모와 자식 모두 fork() 다음 코드부터 실행
5. 부모는 자식의 PID를 반환받고, 자식은 0을 반환받음

**Copy-on-Write (CoW) 최적화**

실제로 fork()는 메모리를 즉시 복사하지 않는다:

- 부모와 자식이 처음에는 같은 물리 메모리를 읽기 전용으로 공유
- 둘 중 하나가 메모리를 수정하려 할 때 Page Fault 발생
- 그때 해당 페이지만 복사

이를 통해 fork() 성능이 극적으로 향상된다.

**Exec 시스템 콜 패밀리**

`exec` 계열 함수들은 **현재 프로세스를 새로운 프로그램으로 교체**한다.

**Exec의 작동 원리**

1. 현재 프로세스의 메모리 영역을 정리
2. 새 프로그램을 메모리에 로드
3. 새 프로그램의 main()부터 실행 시작
4. PID는 그대로 유지
5. 열려있던 파일 디스크립터는 대부분 유지

**Fork-Exec 패턴**

대부분의 유닉스 프로그램은 이 두 시스템 콜을 조합하여 새 프로세스를 생성한다:

1. `fork()`로 자식 프로세스 생성
2. 자식에서 `exec()`로 새 프로그램 실행
3. 부모는 `wait()`로 자식의 종료 대기

이 패턴은 셸(shell)이 명령어를 실행하는 기본 방식이다.

### 7.3 PID와 프로세스 계층

**PID (Process ID)**

각 프로세스는 고유한 PID를 가진다:

- PID는 양의 정수 (일반적으로 1부터 시작)
- 시스템 부팅 시 첫 번째 프로세스는 PID 1 (init 또는 systemd)
- 프로세스 종료 시 PID는 재사용될 수 있음

**PPID (Parent Process ID)**

모든 프로세스는 자신을 생성한 부모 프로세스의 PID인 PPID를 가진다.

**프로세스 트리 구조**

리눅스의 모든 프로세스는 트리 구조를 형성한다. systemd (PID 1)가 루트에 있고, 그 아래로 sshd, dockerd, kubelet 등의 프로세스가 계층적으로 연결된다.

**init 프로세스 (PID 1)**

PID 1은 특별한 역할을 한다:

- 시스템 부팅 시 커널이 직접 실행하는 첫 사용자 공간 프로세스
- 모든 프로세스의 조상
- 고아 프로세스(부모가 먼저 종료된 프로세스)를 입양
- 시스템 종료 시 마지막까지 살아있는 프로세스

전통적으로 init 프로세스였지만, 현대 리눅스는 **systemd**를 사용한다.

**좀비 프로세스와 고아 프로세스**

**좀비 프로세스 (Zombie Process)**

자식 프로세스가 종료되었지만 부모가 아직 `wait()`를 호출하지 않은 상태:

- 프로세스는 종료되었지만 PCB는 남아있음
- 리소스는 해제되었지만 exit status는 보존
- 부모가 `wait()`를 호출하면 완전히 제거됨

**고아 프로세스 (Orphan Process)**

부모 프로세스가 자식보다 먼저 종료된 경우:

- init (PID 1)이 자동으로 새로운 부모가 됨
- init은 주기적으로 `wait()`를 호출하여 좀비 프로세스 정리
- 시스템 안정성 유지

**프로세스 그룹과 세션**

**프로세스 그룹**

관련된 프로세스들을 하나로 묶은 단위:

- 각 그룹은 PGID(Process Group ID)를 가짐
- 시그널을 그룹 전체에 보낼 수 있음
- 파이프라인의 모든 프로세스가 하나의 그룹을 형성

**세션**

하나 이상의 프로세스 그룹을 포함하는 단위:

- 각 세션은 SID(Session ID)를 가짐
- 터미널과 연결된 프로세스들의 집합
- 세션 리더는 제어 터미널을 가질 수 있음

### 7.4 프로세스 상태

**프로세스 상태 전이**

리눅스 프로세스는 다음과 같은 상태를 가진다:

**실행 상태 (Running - R)**

- CPU에서 현재 실행 중이거나 실행 큐에서 대기 중
- ps 명령에서 'R'로 표시

**대기 상태 (Sleeping)**

**인터럽터블 슬립 (Interruptible Sleep - S)**

- I/O 완료나 이벤트를 기다리는 중
- 시그널에 의해 깨어날 수 있음
- 대부분의 대기 상태가 이에 해당

**언인터럽터블 슬립 (Uninterruptible Sleep - D)**

- 디스크 I/O 같은 중요한 작업 대기 중
- 시그널로도 중단할 수 없음
- 이 상태가 오래 지속되면 시스템 문제의 신호

**중단 상태 (Stopped - T)**

- SIGSTOP 또는 SIGTSTP 시그널에 의해 일시 정지
- SIGCONT 시그널로 재개 가능
- 디버거가 프로세스를 제어할 때 사용

**좀비 상태 (Zombie - Z)**

- 프로세스는 종료되었지만 부모가 wait()를 호출하지 않음
- 리소스는 해제되었지만 PCB는 남아있음

---

## 8. 프로세스 스케줄링

### 8.1 스케줄러의 역할

CPU 스케줄러는 **제한된 CPU 자원을 여러 프로세스에 효율적으로 분배**하는 커널의 주요 컴포넌트이다.

**스케줄러의 목표**

- **공정성**: 모든 프로세스에 공평한 CPU 시간 제공
- **응답성**: 사용자 상호작용이 빠르게 느껴지도록
- **처리량**: 단위 시간당 최대한 많은 작업 완료
- **효율성**: 스케줄링 오버헤드 최소화

### 8.2 CFS (Completely Fair Scheduler)

**CFS의 기본 개념**

리눅스 2.6.23부터 사용된 CFS는 **모든 프로세스에 공평하게 CPU 시간을 분배**하는 것을 목표로 한다.

**vruntime (Virtual Runtime)**

CFS의 주요 개념은 `vruntime`이다:

- 각 프로세스가 지금까지 CPU를 사용한 시간을 기록
- 실제 실행 시간을 프로세스의 우선순위로 가중치 조정
- 가장 작은 vruntime을 가진 프로세스가 다음에 실행될 자격이 있음

**Red-Black Tree**

CFS는 실행 큐를 Red-Black Tree로 관리한다:

- vruntime을 키로 사용하는 자가 균형 이진 탐색 트리
- 가장 작은 vruntime(가장 왼쪽 노드)을 O(1)에 찾음
- 프로세스 삽입/삭제도 O(log n)으로 효율적

**스케줄링 과정**

1. 타이머 인터럽트가 주기적으로 발생 (일반적으로 1ms마다)
2. 현재 실행 중인 프로세스의 vruntime 증가
3. vruntime이 일정 값을 초과하면 스케줄러 호출
4. Red-Black Tree에서 가장 작은 vruntime의 프로세스 선택
5. 컨텍스트 스위칭으로 새 프로세스 실행

**nice 값과 우선순위**

nice 값(-20 ~ 19)으로 프로세스 우선순위를 조정할 수 있다. nice 값이 높을수록 우선순위가 낮다.

nice 값이 다른 프로세스의 vruntime 증가율이 달라진다:

- nice 0 프로세스: vruntime이 실시간으로 증가
- nice 19 프로세스: vruntime이 더 빠르게 증가 (CPU를 덜 받음)
- nice -20 프로세스: vruntime이 더 천천히 증가 (CPU를 더 받음)

### 8.3 실시간 스케줄링

**실시간 스케줄링 클래스**

CFS는 일반 프로세스용이고, 실시간 작업을 위한 별도의 스케줄러가 있다:

**SCHED_FIFO (First-In-First-Out)**

- 우선순위 기반의 선점형 스케줄링
- 같은 우선순위 내에서는 FIFO 순서
- 자발적으로 양보하거나 더 높은 우선순위 프로세스가 나타날 때까지 실행

**SCHED_RR (Round-Robin)**

- SCHED_FIFO와 유사하지만 타임 슬라이스 제한 있음
- 같은 우선순위 내에서 순환하며 실행

**주의사항**

실시간 스케줄링은 강력하지만 위험한다:

- 잘못 사용하면 시스템 전체가 응답 불가능해질 수 있음
- root 권한 필요
- 임베디드 시스템이나 특수한 경우에만 사용 권장

### 8.4 CPU Affinity

**CPU Affinity의 개념**

CPU Affinity는 **프로세스가 실행될 수 있는 CPU 코어를 제한**하는 기능이다.

**왜 필요한가?**

**캐시 지역성 (Cache Locality)**

- CPU 코어는 자주 사용하는 데이터를 L1/L2 캐시에 저장
- 프로세스가 같은 코어에서 계속 실행되면 캐시 히트율 증가
- 다른 코어로 이동하면 캐시 미스 발생

**NUMA 최적화**

- 특정 메모리 영역에 가까운 CPU에서 실행하도록 설정
- 원격 메모리 접근 최소화

**간섭 방지**

- 중요한 프로세스를 특정 코어에 고정하여 다른 프로세스의 간섭 방지

**컨테이너 환경에서의 활용**

Kubernetes에서도 CPU Affinity를 활용할 수 있다. CPU Manager 정책을 통해 전용 CPU를 할당하여 성능 최적화가 가능하다.

### 8.5 Context Switching

**컨텍스트 스위칭의 개념**

컨텍스트 스위칭은 **CPU가 한 프로세스의 실행을 중단하고 다른 프로세스를 실행하는 과정**이다.

**컨텍스트 스위칭 과정**

1. **현재 프로세스 상태 저장**

- CPU 레지스터 값을 PCB에 저장
- 프로그램 카운터(PC) 저장
- 스택 포인터 저장

2. **새 프로세스 선택**

- 스케줄러가 다음 실행할 프로세스 결정

3. **새 프로세스 상태 복원**

- 새 프로세스의 PCB에서 레지스터 값 복원
- 페이지 테이블 포인터 변경 (메모리 컨텍스트 전환)
- TLB 플러시

4. **실행 재개**

- 새 프로세스의 다음 명령어부터 실행

**성능 영향**

컨텍스트 스위칭은 비용이 많이 든다:

- **직접 비용**: 레지스터 저장/복원에 수십 마이크로초
- **간접 비용**: 캐시/TLB 무효화로 인한 성능 저하
- 너무 잦은 컨텍스트 스위칭은 시스템 성능 저하

**스레드 vs 프로세스 전환**

스레드 간 컨텍스트 스위칭이 프로세스 간보다 빠른 이유:

- 같은 주소 공간을 사용하므로 페이지 테이블 변경 불필요
- TLB 플러시 불필요
- 캐시 무효화가 적음

---

## 9. 시그널과 IPC

### 9.1 Signal (시그널)

**시그널의 개념**

시그널은 **프로세스에게 비동기적으로 이벤트를 알리는 소프트웨어 인터럽트**이다.

**자주 사용되는 시그널**

**SIGINT (2)**

- Ctrl+C로 발생
- 프로그램 종료 요청 (잡을 수 있음)
- 정상적인 종료 처리 가능

**SIGTERM (15)**

- 기본 kill 명령의 시그널
- 우아한 종료(graceful shutdown) 요청
- 프로세스가 정리 작업 후 종료 가능

**SIGKILL (9)**

- 강제 종료
- 잡을 수 없고 무시할 수 없음
- 즉시 프로세스 종료

**SIGSTOP (19)**

- 프로세스 일시 정지
- 잡을 수 없음

**SIGCONT (18)**

- 정지된 프로세스 재개

**SIGCHLD (17)**

- 자식 프로세스가 종료되거나 상태 변경 시 부모에게 전송
- wait() 시스템 콜과 함께 사용

**시그널 처리**

프로세스는 시그널을 세 가지 방식으로 처리할 수 있다:

**기본 동작 (Default Action)**

- 시그널 핸들러를 설정하지 않으면 기본 동작 수행
- SIGTERM의 기본 동작은 프로세스 종료

**무시 (Ignore)**

- 특정 시그널을 무시하도록 설정 가능

**사용자 정의 핸들러 (Custom Handler)**

- 개발자가 직접 시그널 처리 로직 정의
- 정리 작업이나 상태 저장 등 수행 가능

### 9.2 IPC (Inter-Process Communication)

**IPC의 필요성**

프로세스는 기본적으로 독립된 메모리 공간을 가지므로, 데이터를 교환하려면 특별한 메커니즘이 필요한다.

**Pipe (파이프)**

가장 간단한 IPC 메커니즘으로, 한 방향 데이터 스트림을 제공한다. 주로 부모-자식 프로세스 간 통신에 사용된다.

**Named Pipe (FIFO)**

일반 파이프와 달리 파일 시스템에 이름을 가지며, 관련 없는 프로세스 간에도 통신 가능하다.

**Message Queue (메시지 큐)**

구조화된 메시지를 주고받을 수 있는 IPC 메커니즘이다. 메시지 타입별로 선택적 수신이 가능하다.

**Shared Memory (공유 메모리)**

가장 빠른 IPC 방법으로, 여러 프로세스가 같은 물리 메모리 영역을 공유한다. 주의사항으로 동기화 메커니즘(세마포어, 뮤텍스 등)과 함께 사용해야 한다.

**Semaphore (세마포어)**

프로세스 간 동기화를 위한 메커니즘이다. 공유 자원에 대한 접근을 제어한다.

**Socket (소켓)**

네트워크 통신에 사용되지만, 같은 시스템 내 프로세스 간 통신에도 사용 가능하다 (Unix Domain Socket).

**IPC 메커니즘 비교**

- **Pipe**: 중간 속도, 사용 쉬움, 부모-자식 간 단순 데이터 전송
- **FIFO**: 중간 속도, 사용 쉬움, 무관한 프로세스 간 스트림 전송
- **Message Queue**: 중간 속도, 구조화된 메시지 전송
- **Shared Memory**: 가장 빠름, 사용 어려움, 동기화 필요, 대용량 데이터 공유
- **Semaphore**: 동기화 전용
- **Socket**: 가장 느림, 네트워크/로컬 통신

---

## 10. 파일 시스템

### 10.1 VFS (Virtual File System)

**VFS의 역할**

VFS는 **다양한 파일 시스템에 대한 통합된 추상화 계층**을 제공한다. 이를 통해 사용자 프로그램은 파일 시스템의 종류와 관계없이 동일한 API를 사용할 수 있다.

**VFS의 구조**

VFS는 다음과 같은 주요 객체를 정의한다:

**superblock**

- 파일 시스템 전체의 메타데이터
- 파일 시스템 타입, 크기, 상태 등

**inode (Index Node)**

- 파일의 메타데이터를 저장하는 자료구조
- 파일 크기, 권한, 소유자, 타임스탬프
- 데이터 블록 위치 정보
- 파일 이름은 inode에 저장되지 않음 (dentry에 저장)

**dentry (Directory Entry)**

- 파일 이름과 inode 번호의 매핑
- 디렉토리 구조를 표현
- 파일 경로 탐색에 사용

**file**

- 열린 파일을 나타내는 커널 자료구조
- 파일 오프셋 (현재 읽기/쓰기 위치)
- 파일 디스크립터와 연결

**VFS의 장점**

- 애플리케이션은 파일 시스템 타입을 신경 쓸 필요 없음
- 새로운 파일 시스템 추가가 용이
- 다양한 저장 장치를 동일한 방식으로 접근

### 10.2 inode와 Hard Link / Symbolic Link

**inode의 역할**

inode는 파일의 실제 메타데이터를 저장하는 주요 자료구조이다:

- 파일 타입 (일반 파일, 디렉토리, 심볼릭 링크 등)
- 파일 권한 (rwxrwxrwx)
- 소유자 UID, 그룹 GID
- 파일 크기
- 타임스탬프 (생성, 수정, 접근 시간)
- 하드 링크 카운트
- 데이터 블록 포인터

**Hard Link (하드 링크)**

하드 링크는 **같은 inode를 가리키는 여러 개의 파일 이름**이다:

- 원본 파일과 하드 링크는 완전히 동등
- 하나를 삭제해도 다른 링크는 유효
- 모든 하드 링크가 삭제되어야 inode와 데이터 블록 삭제
- 같은 파일 시스템 내에서만 생성 가능
- 디렉토리에 대해서는 생성 불가 (루프 방지)

**Symbolic Link (심볼릭 링크, Soft Link)**

심볼릭 링크는 **다른 파일의 경로를 저장하는 특수 파일**이다:

- 원본 파일의 경로를 문자열로 저장
- 원본 파일이 삭제되면 심볼릭 링크는 깨짐 (dangling link)
- 다른 파일 시스템의 파일도 가리킬 수 있음
- 디렉토리에 대해서도 생성 가능

### 10.3 파일 디스크립터 (File Descriptor)

**파일 디스크립터의 개념**

파일 디스크립터는 **열린 파일을 식별하는 정수**이다. 프로세스가 파일을 열면 커널이 파일 디스크립터를 할당한다.

**표준 파일 디스크립터**

모든 프로세스는 기본적으로 3개의 파일 디스크립터를 가진다:

- **0 (STDIN_FILENO)**: 표준 입력
- **1 (STDOUT_FILENO)**: 표준 출력
- **2 (STDERR_FILENO)**: 표준 에러

**파일 디스크립터 테이블**

각 프로세스는 자신만의 파일 디스크립터 테이블을 가진다:

- 파일 디스크립터 → 파일 객체 포인터 매핑
- fork() 시 부모의 파일 디스크립터 테이블 복사
- exec() 후에도 기본적으로 유지 (close-on-exec 플래그 제외)

**파일 디스크립터와 inode의 관계**

파일 디스크립터 → 파일 객체 → inode 의 3단계 간접 참조 구조이다:

- 여러 파일 디스크립터가 같은 파일 객체를 가리킬 수 있음
- 여러 파일 객체가 같은 inode를 가리킬 수 있음

### 10.4 Block Device와 Journaling

**Block Device (블록 디바이스)**

블록 디바이스는 **고정 크기 블록 단위로 데이터를 읽고 쓰는 장치**이다:

- HDD, SSD, USB 드라이브 등
- 블록 크기는 보통 512 바이트 또는 4KB
- 랜덤 액세스 가능 (특정 블록 직접 접근)

**Character Device와의 차이**

- **Block Device**: 블록 단위, 랜덤 액세스, 캐싱 가능
- **Character Device**: 바이트 스트림, 순차 액세스, 캐싱 불가 (키보드, 마우스 등)

**Journaling File System**

저널링은 **파일 시스템의 일관성을 보장**하기 위한 메커니즘이다.

**저널링의 작동 원리**

1. 파일 시스템 변경 작업을 저널(로그)에 먼저 기록
2. 저널에 변경 내용이 안전하게 기록되면 실제 파일 시스템에 적용
3. 작업 완료 후 저널 엔트리 삭제

**장점**

- 시스템 크래시나 전원 차단 시에도 파일 시스템 복구 가능
- fsck(파일 시스템 검사) 시간 대폭 단축
- 데이터 무결성 향상

**저널링 모드**

**Journal (가장 안전)**

- 메타데이터와 데이터 모두 저널에 기록
- 가장 느리지만 가장 안전

**Ordered (기본값)**

- 메타데이터만 저널에 기록
- 데이터는 메타데이터 이전에 먼저 기록
- 성능과 안정성의 균형

**Writeback (가장 빠름)**

- 메타데이터만 저널에 기록
- 데이터 쓰기 순서 보장 안 됨
- 가장 빠르지만 일관성 낮음

**주요 저널링 파일 시스템**

- **ext4**: 리눅스의 기본 파일 시스템
- **XFS**: 대용량 파일과 병렬 I/O에 최적화
- **Btrfs**: 스냅샷, 압축 등 고급 기능 제공
- **F2FS**: SSD/플래시 메모리 최적화

### 10.5 파일 시스템 마운트

**마운트의 개념**

마운트는 **파일 시스템을 디렉토리 트리의 특정 위치에 연결**하는 작업이다.

**마운트 과정**

1. 블록 디바이스 확인
2. 파일 시스템 타입 식별
3. 슈퍼블록 읽기
4. 마운트 포인트에 파일 시스템 연결

**마운트 포인트**

- 기존 디렉토리를 마운트 포인트로 사용
- 마운트 전 해당 디렉토리의 내용은 숨겨짐
- 언마운트하면 원래 내용이 다시 나타남

**바인드 마운트 (Bind Mount)**

이미 마운트된 디렉토리를 다른 위치에 연결:

- 같은 파일 시스템을 여러 위치에서 접근 가능
- 컨테이너 기술에서 호스트 디렉토리를 컨테이너에 공유할 때 사용

---

## 11. 디바이스와 I/O

### 11.1 디바이스 파일

**디바이스 파일의 개념**

리눅스에서는 **"Everything is a file"** 철학에 따라 하드웨어 장치도 파일로 표현된다. 디바이스 파일은 주로 `/dev` 디렉토리에 위치한다.

**디바이스 파일 타입**

**Character Device (문자 디바이스)**

- 바이트 스트림 방식으로 데이터 전송
- 버퍼링 없이 직접 접근
- 예: 키보드, 마우스, 시리얼 포트
- `ls -l`에서 'c'로 표시

**Block Device (블록 디바이스)**

- 고정 크기 블록 단위로 데이터 전송
- 버퍼링과 캐싱 가능
- 랜덤 액세스 지원
- 예: 하드 디스크, SSD, USB 드라이브
- `ls -l`에서 'b'로 표시

**주요 디바이스 파일**

- `/dev/null`: 쓰기는 버려지고, 읽기는 EOF 반환
- `/dev/zero`: 읽으면 무한한 0 바이트 스트림 반환
- `/dev/random`, `/dev/urandom`: 난수 생성
- `/dev/sda`, `/dev/sdb`: SCSI/SATA 디스크
- `/dev/nvme0n1`: NVMe SSD
- `/dev/tty`: 현재 터미널

### 11.2 Major/Minor Number

**디바이스 번호**

각 디바이스 파일은 Major Number와 Minor Number를 가진다:

**Major Number**

- 디바이스 드라이버를 식별
- 커널이 어떤 드라이버로 요청을 라우팅할지 결정

**Minor Number**

- 같은 드라이버가 관리하는 여러 장치를 구분
- 예: `/dev/sda1`, `/dev/sda2`는 같은 Major, 다른 Minor

### 11.3 I/O 모델

**Blocking I/O (블로킹 I/O)**

가장 일반적인 I/O 모델로, I/O 작업이 완료될 때까지 프로세스가 대기한다:

- 간단하고 직관적
- 하지만 대기 중에는 다른 작업 불가
- 한 번에 하나의 I/O만 처리

**Non-blocking I/O (논블로킹 I/O)**

I/O 작업을 즉시 반환하고, 데이터가 준비되지 않았으면 에러를 반환한다:

- 프로세스가 대기하지 않고 다른 작업 수행 가능
- 하지만 폴링이 필요하여 CPU 낭비 가능

**I/O Multiplexing (다중 I/O)**

여러 파일 디스크립터를 동시에 모니터링:

- **select()**: 가장 오래된 방식, FD 개수 제한 있음
- **poll()**: select()의 개선 버전, FD 개수 제한 없음
- **epoll()**: 리눅스 전용, 대량 연결에 최적화

**Asynchronous I/O (비동기 I/O)**

I/O 작업을 요청하고 즉시 반환하며, 작업 완료 시 콜백이나 시그널로 통지:

- 가장 효율적이지만 구현이 복잡
- 리눅스의 AIO (Asynchronous I/O) API

### 11.4 Direct I/O와 Buffer I/O

**Buffer I/O (버퍼 I/O)**

기본 I/O 방식으로, Page Cache를 통해 수행된다:

- 커널이 자동으로 캐싱 및 선행 읽기(readahead) 수행
- 대부분의 애플리케이션에 적합
- 쓰기는 즉시 반환 (write-back)

**Direct I/O**

Page Cache를 우회하고 직접 디스크와 통신:

- 데이터베이스 같은 애플리케이션이 자체 캐시 관리 시 유용
- 커널의 캐싱 오버헤드 제거
- 하지만 애플리케이션이 모든 최적화를 책임져야 함
- O_DIRECT 플래그로 활성화

### 11.5 Zero-Copy

**전통적인 데이터 복사**

네트워크로 파일을 전송할 때 전통적 방식:

1. 디스크 → 커널 버퍼 (DMA)
2. 커널 버퍼 → 사용자 공간 버퍼 (CPU 복사)
3. 사용자 공간 버퍼 → 소켓 버퍼 (CPU 복사)
4. 소켓 버퍼 → 네트워크 카드 (DMA)

총 4번의 컨텍스트 스위칭과 2번의 CPU 복사가 발생한다.

**Zero-Copy 최적화**

`sendfile()` 시스템 콜 사용 시:

1. 디스크 → 커널 버퍼 (DMA)
2. 커널 버퍼 → 네트워크 카드 (DMA, CPU 복사 없음)

사용자 공간을 거치지 않아:

- 컨텍스트 스위칭 2회로 감소
- CPU 복사 0회 (DMA만 사용)
- 대폭적인 성능 향상

웹 서버나 파일 서버에서 매우 중요한 최적화 기법이다.

---

## 12. 리눅스 보안 메커니즘 (컨테이너 기술의 기반)

> **Note**: 이 섹션은 컨테이너 기술(Docker, Kubernetes)의 핵심 기반이 되는 리눅스 격리 및 보안 기술을 다룹니다. 특히 Namespaces와 Cgroups는 컨테이너가 동작하는 근본
> 원리이므로, 컨테이너를 깊이 이해하려면 반드시 학습해야 합니다.

### 12.1 UID/GID와 Permission Model

**UID와 GID**

리눅스는 사용자와 그룹을 숫자로 식별한다:

**UID (User ID)**

- 각 사용자는 고유한 UID를 가짐
- UID 0은 root 사용자 (슈퍼유저)
- 일반 사용자는 보통 1000부터 시작

**GID (Group ID)**

- 각 그룹은 고유한 GID를 가짐
- 사용자는 여러 그룹에 속할 수 있음
- Primary Group과 Supplementary Groups

**파일 권한 모델**

리눅스의 전통적인 권한 모델은 rwx 비트로 구성된다:

**권한 비트**

- **r (read)**: 파일 읽기, 디렉토리 목록 보기
- **w (write)**: 파일 쓰기, 디렉토리에 파일 생성/삭제
- **x (execute)**: 파일 실행, 디렉토리 진입

**세 가지 권한 그룹**

- **User (Owner)**: 파일 소유자의 권한
- **Group**: 파일 그룹의 권한
- **Others**: 그 외 모든 사용자의 권한

예: `rwxr-xr--`

- 소유자: 읽기, 쓰기, 실행 가능
- 그룹: 읽기, 실행 가능
- 기타: 읽기만 가능

**특수 권한 비트**

**SUID (Set User ID)**

- 파일 실행 시 소유자의 권한으로 실행
- `/usr/bin/passwd`가 대표적 예

**SGID (Set Group ID)**

- 파일 실행 시 그룹의 권한으로 실행
- 디렉토리에 설정 시 새 파일이 디렉토리 그룹을 상속

**Sticky Bit**

- 디렉토리에 설정 시 소유자만 파일 삭제 가능
- `/tmp` 디렉토리가 대표적 예

### 12.2 DAC vs MAC

**DAC (Discretionary Access Control)**

전통적인 리눅스 권한 모델로, **파일 소유자가 권한을 결정**한다:

**특징**

- 유연하고 사용하기 쉬움
- 사용자가 자신의 파일에 대한 전체 제어권 보유
- 하지만 보안 정책 강제가 어려움

**한계**

- 악의적인 프로그램이 사용자 권한으로 모든 파일 접근 가능
- 권한 관리가 분산되어 일관된 보안 정책 적용 어려움

**MAC (Mandatory Access Control)**

시스템 관리자가 정의한 **강제 보안 정책**을 적용한다:

**특징**

- 중앙화된 보안 정책
- 사용자도 정책을 우회할 수 없음
- 더 강력한 보안

**리눅스의 MAC 구현**

**SELinux (Security-Enhanced Linux)**

- NSA에서 개발
- 레이블 기반 접근 제어
- Red Hat, CentOS, Fedora의 기본값
- 복잡하지만 매우 강력

**AppArmor**

- Novell에서 개발
- 경로 기반 접근 제어
- Ubuntu, SUSE의 기본값
- SELinux보다 사용하기 쉬움

### 12.3 Linux Capabilities

**Capabilities의 개념**

전통적으로 root는 모든 권한을 가지는 "전능한" 사용자였다. Capabilities는 **root의 권한을 세분화된 단위로 분할**한 것이다.

**주요 Capabilities**

**CAP_NET_ADMIN**

- 네트워크 인터페이스 설정
- 방화벽 규칙 수정
- 라우팅 테이블 변경

**CAP_SYS_ADMIN**

- 가장 광범위한 권한
- 마운트, 스왑 설정, 호스트명 변경 등
- 보안상 가장 위험한 capability

**CAP_KILL**

- 임의의 프로세스에 시그널 전송

**CAP_NET_BIND_SERVICE**

- 1024 이하의 특권 포트 바인딩 (HTTP 80, HTTPS 443 등)

**CAP_CHOWN**

- 파일 소유자 변경

**CAP_DAC_OVERRIDE**

- 파일 권한 검사 우회

**Capabilities의 장점**

- 프로세스에 필요한 최소 권한만 부여 (최소 권한 원칙)
- root 권한 없이도 특정 작업 수행 가능
- 컨테이너 보안의 주요 메커니즘

**컨테이너와 Capabilities**

Docker 컨테이너는 기본적으로 제한된 capabilities만 가진다:

- 불필요한 capabilities 제거하여 공격 표면 축소
- 필요 시 `--cap-add`로 추가
- `--cap-drop`으로 기본 capabilities도 제거 가능

### 12.4 Seccomp (Secure Computing Mode)

**Seccomp의 개념**

Seccomp는 **프로세스가 사용할 수 있는 시스템 콜을 제한**하는 보안 메커니즘이다.

**Seccomp 모드**

**Strict Mode**

- 가장 제한적인 모드
- read(), write(), exit(), sigreturn()만 허용
- 거의 사용되지 않음

**Filter Mode (Seccomp-BPF)**

- BPF(Berkeley Packet Filter) 프로그램으로 시스템 콜 필터링
- 세밀한 제어 가능
- 현대 컨테이너 보안의 주요

**작동 방식**

1. BPF 프로그램으로 허용/거부 규칙 정의
2. 프로세스에 seccomp 필터 적용
3. 금지된 시스템 콜 호출 시 SIGSYS 시그널 또는 프로세스 종료

**컨테이너와 Seccomp**

Docker는 기본 seccomp 프로파일을 적용한다:

- 약 300개 중 44개의 위험한 시스템 콜을 차단
- 컨테이너 탈출 방지
- 커널 취약점 악용 방지

차단되는 시스템 콜 예시:

- `reboot`: 시스템 재부팅
- `swapon`/`swapoff`: 스왑 제어
- `mount`: 파일 시스템 마운트
- `keyctl`: 커널 키 관리

### 12.5 Linux Namespaces (격리 기술의 핵심)

**Namespace란?**

Linux Namespace는 프로세스를 격리하여 서로 독립된 환경에서 실행되도록 하는 커널 기능이다. 이는 **컨테이너의 핵심 기술**이며, Docker와 Kubernetes가 작동하는 근본 원리이다.

**Namespace의 핵심 개념**

- 각 Namespace는 글로벌 시스템 리소스를 격리된 인스턴스로 제공
- 프로세스는 자신이 속한 Namespace만 볼 수 있음
- 서로 다른 Namespace의 프로세스는 서로를 볼 수 없음
- 컨테이너는 여러 Namespace를 조합하여 격리된 환경을 구성

**7가지 Linux Namespace**

```
┌────────────────────────────────────────────────────────┐
│ Namespace Type │ 격리 대상           │ 생성 플래그    │
├────────────────┼─────────────────────┼───────────────┤
│ PID            │ 프로세스 ID         │ CLONE_NEWPID  │
│ Mount (MNT)    │ 파일시스템 마운트   │ CLONE_NEWNS   │
│ Network (NET)  │ 네트워크 스택       │ CLONE_NEWNET  │
│ UTS            │ 호스트명, 도메인명  │ CLONE_NEWUTS  │
│ IPC            │ IPC 리소스          │ CLONE_NEWIPC  │
│ User           │ UID/GID 매핑        │ CLONE_NEWUSER │
│ Cgroup         │ Cgroup 루트         │ CLONE_NEWCGROUP│
└────────────────┴─────────────────────┴───────────────┘
```

#### 12.5.1 PID Namespace

**PID Namespace의 역할**

프로세스 ID를 격리하여, 각 Namespace마다 독립적인 PID 번호를 가질 수 있다.

**특징**

- Namespace 내부에서는 PID 1부터 시작
- 외부(호스트)에서는 다른 PID로 보임
- 부모 Namespace는 자식 Namespace의 프로세스를 볼 수 있지만, 역은 불가능
- 컨테이너 내부의 PID 1은 특별한 역할 (init 프로세스)

**PID Namespace 실습**

```bash
# 새로운 PID Namespace에서 bash 실행
unshare --pid --fork --mount-proc bash

# 내부에서 프로세스 목록 확인
ps aux
# PID 1부터 시작하는 프로세스만 보임

# 다른 터미널에서 호스트 관점으로 확인
ps aux | grep bash
# 실제 PID는 다른 번호

# PID Namespace 확인
ls -l /proc/$$/ns/pid
readlink /proc/$$/ns/pid
# pid:[4026532xxx] 형태로 출력
```

**컨테이너에서의 PID Namespace**

```bash
# Docker 컨테이너 실행
docker run -it ubuntu bash

# 컨테이너 내부에서
ps aux
# PID 1: bash (컨테이너의 init 프로세스)

# 호스트에서 확인
docker inspect <container_id> | grep Pid
# "Pid": 12345 (호스트의 실제 PID)
```

#### 12.5.2 Mount Namespace

**Mount Namespace의 역할**

파일시스템 마운트 포인트를 격리한다. 각 Namespace는 독립적인 파일시스템 트리를 가진다.

**특징**

- 한 Namespace의 마운트 변경은 다른 Namespace에 영향을 주지 않음
- 컨테이너가 독립적인 파일시스템을 가질 수 있는 기반
- chroot의 진화된 형태

**Mount Namespace 실습**

```bash
# 새로운 Mount Namespace 생성
unshare --mount bash

# 임시 파일시스템 마운트
mkdir /tmp/test
mount -t tmpfs tmpfs /tmp/test
echo "hello from namespace" > /tmp/test/file.txt

# 다른 터미널에서 확인
cat /tmp/test/file.txt
# 파일이 보이지 않음 (다른 Namespace)

# Namespace 종료 후
exit
cat /tmp/test/file.txt
# 여전히 보이지 않음 (마운트가 격리됨)
```

**컨테이너에서의 활용**

```bash
# Docker는 컨테이너마다 독립적인 루트 파일시스템을 제공
docker run -it ubuntu bash

# 컨테이너 내부에서 마운트 확인
mount
# 호스트와 다른 마운트 정보
```

#### 12.5.3 Network Namespace

**Network Namespace의 역할**

네트워크 스택(인터페이스, 라우팅 테이블, iptables 규칙 등)을 격리한다.

**격리되는 네트워크 리소스**

- 네트워크 인터페이스 (eth0, lo 등)
- IP 주소
- 라우팅 테이블
- iptables/nftables 규칙
- 소켓

**Network Namespace 실습**

```bash
# 새로운 Network Namespace 생성
ip netns add test_ns

# Namespace 목록 확인
ip netns list

# Namespace 내부에서 명령 실행
ip netns exec test_ns ip addr
# lo 인터페이스만 존재 (DOWN 상태)

# lo 인터페이스 활성화
ip netns exec test_ns ip link set lo up

# veth pair 생성 (가상 이더넷 쌍)
ip link add veth0 type veth peer name veth1

# veth1을 Namespace로 이동
ip link set veth1 netns test_ns

# 호스트 측 veth0 설정
ip addr add 192.168.100.1/24 dev veth0
ip link set veth0 up

# Namespace 측 veth1 설정
ip netns exec test_ns ip addr add 192.168.100.2/24 dev veth1
ip netns exec test_ns ip link set veth1 up

# 연결 테스트
ping -c 2 192.168.100.2
ip netns exec test_ns ping -c 2 192.168.100.1

# 정리
ip netns del test_ns
```

**Docker 네트워크와 Network Namespace**

```bash
# Docker 컨테이너 실행
docker run -d --name web nginx

# 컨테이너의 Network Namespace 찾기
docker inspect web | grep SandboxKey
# "SandboxKey": "/var/run/docker/netns/xxxx"

# 컨테이너 내부의 네트워크 확인
docker exec web ip addr

# 호스트의 veth 인터페이스 확인
ip link | grep veth
# Docker가 자동으로 veth pair를 생성
```

#### 12.5.4 UTS Namespace

**UTS Namespace의 역할**

호스트명(hostname)과 도메인명(domainname)을 격리한다.

**특징**

- 각 컨테이너가 독립적인 호스트명을 가질 수 있음
- UTS는 "Unix Time-Sharing System"의 약자

**UTS Namespace 실습**

```bash
# 현재 호스트명 확인
hostname

# 새로운 UTS Namespace 생성
unshare --uts bash

# 호스트명 변경
hostname container-test
hostname
# container-test

# 다른 터미널에서 확인
hostname
# 원래 호스트명 (변경되지 않음)
```

#### 12.5.5 IPC Namespace

**IPC Namespace의 역할**

프로세스 간 통신(IPC) 리소스를 격리한다.

**격리되는 IPC 리소스**

- System V IPC (메시지 큐, 세마포어, 공유 메모리)
- POSIX 메시지 큐

**IPC Namespace 실습**

```bash
# IPC 리소스 확인
ipcs -a

# 새로운 IPC Namespace에서 실행
unshare --ipc bash

# IPC 리소스 확인
ipcs -a
# 비어 있음 (격리됨)
```

#### 12.5.6 User Namespace (보안의 핵심)

**User Namespace의 역할**

UID(User ID)와 GID(Group ID)를 매핑하여, 컨테이너 내부의 root를 호스트의 일반 사용자로 실행할 수 있다.

**보안적 중요성**

- **Rootless 컨테이너**의 핵심 기술
- 컨테이너 탈출 시에도 호스트에서는 제한된 권한만 가짐
- 가장 강력한 격리 메커니즘

**User Namespace 동작 원리**

```
컨테이너 내부        →        호스트
─────────────────────────────────────
UID 0 (root)         →        UID 1000 (일반 사용자)
UID 1 (daemon)       →        UID 1001
UID 2 (bin)          →        UID 1002
...
```

**User Namespace 실습**

```bash
# User Namespace 생성
unshare --user --map-root-user bash

# UID 확인
id
# uid=0(root) gid=0(root) (Namespace 내부)

# 다른 터미널에서 실제 UID 확인
ps aux | grep bash
# 실제로는 일반 사용자 권한

# /etc/passwd 읽기 시도
cat /etc/passwd
# 가능 (읽기 권한은 있음)

# 하지만 시스템 변경은 불가능
# 예: iptables, mount 등은 실패
```

**Docker에서 User Namespace 사용**

```bash
# Docker daemon에 User Namespace 활성화
# /etc/docker/daemon.json
{
  "userns-remap": "default"
}

# Docker 재시작
systemctl restart docker

# 컨테이너 실행
docker run -it --rm ubuntu bash

# 컨테이너 내부에서
id
# uid=0(root)

# 호스트에서 프로세스 확인
ps aux | grep bash
# UID 100000+ (매핑된 UID)
```

#### 12.5.7 Cgroup Namespace

**Cgroup Namespace의 역할**

Cgroup 파일시스템의 루트를 격리하여, 컨테이너가 자신의 Cgroup 트리만 볼 수 있게 한다.

**특징**

- 컨테이너가 호스트의 Cgroup 정보를 볼 수 없음
- Cgroup v2에서 더욱 중요

**Namespace 조합 예제**

```bash
# 모든 Namespace를 격리하여 컨테이너와 유사한 환경 생성
unshare --pid --fork --mount --uts --ipc --net --user --map-root-user bash

# PID 1로 실행됨
echo $$
# 1

# 독립적인 호스트명
hostname my-container
hostname

# 독립적인 네트워크 스택
ip addr
# lo만 존재
```

### 12.6 Control Groups (Cgroups) (리소스 제한의 핵심)

**Cgroups란?**

Control Groups (Cgroups)는 프로세스 그룹의 **리소스 사용량을 제한, 격리, 모니터링**하는 Linux 커널 기능이다. Namespace가 "무엇을 볼 수 있는가"를 제어한다면,
Cgroups는 "얼마나 사용할 수 있는가"를 제어한다.

**Cgroups의 주요 기능**

- **Resource Limiting (제한)**: CPU, 메모리, I/O 등의 사용량 제한
- **Prioritization (우선순위)**: 리소스 경쟁 시 우선순위 설정
- **Accounting (계정)**: 리소스 사용량 측정 및 모니터링
- **Control (제어)**: 프로세스 그룹 관리 (freeze, resume)

**Cgroups가 없다면?**

```bash
# 악의적인 프로세스가 모든 메모리를 점유
stress --vm 10 --vm-bytes 10G

# 시스템 전체가 다운될 수 있음
# Cgroups로 제한하면 안전하게 격리 가능
```

#### 12.6.1 Cgroup v1 vs Cgroup v2

**Cgroup v1 (레거시)**

```
/sys/fs/cgroup/
├── cpu/            # CPU 제어
├── memory/         # 메모리 제어
├── blkio/          # 블록 I/O 제어
├── net_cls/        # 네트워크 분류
├── devices/        # 디바이스 접근 제어
└── ...
```

**특징:**

- 서브시스템(컨트롤러)마다 독립적인 계층 구조
- 복잡하고 일관성 없는 인터페이스
- 서브시스템 간 조정이 어려움

**Cgroup v2 (통합 계층)**

```
/sys/fs/cgroup/
└── unified/        # 단일 계층 구조
    ├── cgroup.controllers
    ├── cgroup.subtree_control
    ├── cpu.max
    ├── memory.max
    └── io.max
```

**특징:**

- 단일 통합 계층 구조
- 일관된 인터페이스
- 더 나은 리소스 관리
- systemd가 기본으로 사용 (최신 배포판)

**Cgroup 버전 확인**

```bash
# Cgroup v1
mount | grep cgroup
# cgroup on /sys/fs/cgroup/cpu type cgroup (cpu)
# cgroup on /sys/fs/cgroup/memory type cgroup (memory)

# Cgroup v2
mount | grep cgroup
# cgroup2 on /sys/fs/cgroup type cgroup2

# 혼합 모드 (v1 + v2)도 가능
```

#### 12.6.2 Cgroup 계층 구조

**Cgroup 트리**

Cgroup은 계층 구조(트리)로 구성되며, 자식은 부모의 설정을 상속한다.

```
root cgroup (/)
├── system.slice/
│   ├── sshd.service
│   ├── docker.service
│   └── ...
├── user.slice/
│   ├── user-1000.slice/
│   │   └── session-1.scope
│   └── ...
└── machine.slice/      # 가상머신/컨테이너
    ├── docker-<id>.scope
    └── libvirt-<id>.scope
```

**systemd와 Cgroup**

현대 Linux 시스템에서 systemd가 Cgroup 트리를 관리한다.

```bash
# Cgroup 트리 확인
systemd-cgls

# 특정 서비스의 Cgroup 확인
systemctl status docker
# CGroup: /system.slice/docker.service

# Cgroup 파일시스템 확인
ls /sys/fs/cgroup/system.slice/docker.service/
# cpu.max, memory.max, io.max 등
```

#### 12.6.3 CPU 제어

**CPU 제한 방식**

**1. CPU Shares (가중치 기반)**

CPU 경쟁 상황에서의 상대적 우선순위를 설정한다.

```bash
# Cgroup v1
echo 512 > /sys/fs/cgroup/cpu/mygroup/cpu.shares

# Cgroup v2
echo 100 > /sys/fs/cgroup/mygroup/cpu.weight
```

- 기본값: 1024 (v1) or 100 (v2)
- 2048 = 2배의 CPU 시간
- CPU가 여유로우면 제한 없이 사용 가능

**2. CPU Quota (절대 제한)**

CPU 사용량을 절대적으로 제한한다.

```bash
# Cgroup v1
# period: 100ms (100,000 microseconds)
echo 100000 > /sys/fs/cgroup/cpu/mygroup/cpu.cfs_period_us

# quota: 50ms (= 50% of 1 core)
echo 50000 > /sys/fs/cgroup/cpu/mygroup/cpu.cfs_quota_us

# Cgroup v2 (더 간단)
echo "50000 100000" > /sys/fs/cgroup/mygroup/cpu.max
# 형식: $MAX $PERIOD
```

**예시: Docker에서 CPU 제한**

```bash
# 0.5 CPU 코어로 제한
docker run -it --cpus="0.5" ubuntu bash

# CPU shares 설정 (기본 1024)
docker run -it --cpu-shares=512 ubuntu bash

# 특정 CPU 코어만 사용
docker run -it --cpuset-cpus="0,1" ubuntu bash
```

**CPU 사용량 모니터링**

```bash
# Cgroup 내 프로세스의 CPU 사용량
cat /sys/fs/cgroup/system.slice/docker.service/cpu.stat

# Docker 컨테이너 CPU 사용량
docker stats <container_id>
```

#### 12.6.4 Memory 제어

**메모리 제한**

```bash
# Cgroup v1
echo 512M > /sys/fs/cgroup/memory/mygroup/memory.limit_in_bytes

# Cgroup v2
echo 512M > /sys/fs/cgroup/mygroup/memory.max

# Swap 제한
echo 1G > /sys/fs/cgroup/mygroup/memory.swap.max
```

**OOM (Out of Memory) 동작 제어**

```bash
# Cgroup v1
# OOM Killer 비활성화 (권장하지 않음)
echo 1 > /sys/fs/cgroup/memory/mygroup/memory.oom_control

# Cgroup v2
# memory.oom.group: 그룹 전체를 OOM 대상으로
echo 1 > /sys/fs/cgroup/mygroup/memory.oom.group
```

**메모리 사용량 모니터링**

```bash
# 현재 메모리 사용량
cat /sys/fs/cgroup/mygroup/memory.current

# 메모리 통계
cat /sys/fs/cgroup/mygroup/memory.stat
# anon: 익명 메모리
# file: 페이지 캐시
# shmem: 공유 메모리
```

**Docker 메모리 제한 예제**

```bash
# 512MB 메모리 제한
docker run -it --memory="512m" ubuntu bash

# 메모리 + Swap 제한
docker run -it --memory="512m" --memory-swap="1g" ubuntu bash

# Swap 비활성화
docker run -it --memory="512m" --memory-swap="512m" ubuntu bash

# 메모리 예약 (최소 보장)
docker run -it --memory-reservation="256m" --memory="512m" ubuntu bash
```

**메모리 부족 시 동작**

```bash
# 테스트: 컨테이너에서 메모리 부족 유발
docker run -it --memory="100m" ubuntu bash

# 컨테이너 내부에서
apt update && apt install -y stress
stress --vm 1 --vm-bytes 200M
# OOM Killer가 프로세스를 종료시킴

# 호스트에서 확인
dmesg | grep -i "killed process"
```

#### 12.6.5 Block I/O 제어

**I/O 제한 (Cgroup v1: blkio, v2: io)**

```bash
# Cgroup v2
# I/O weight (상대적 우선순위)
echo "default 100" > /sys/fs/cgroup/mygroup/io.weight

# I/O max (절대 제한)
# 형식: MAJOR:MINOR RBPS WBPS RIOPS WIOPS
echo "8:0 rbps=10485760 wbps=10485760" > /sys/fs/cgroup/mygroup/io.max
# 8:0 = /dev/sda
# rbps = read bytes per second (10MB/s)
# wbps = write bytes per second (10MB/s)
```

**디바이스 번호 확인**

```bash
ls -l /dev/sda
# brw-rw---- 1 root disk 8, 0 Dec 28 10:00 /dev/sda
#                        ↑  ↑
#                     Major Minor
```

**Docker I/O 제한**

```bash
# I/O weight (기본 500, 범위 10-1000)
docker run -it --blkio-weight=300 ubuntu bash

# 읽기 속도 제한 (10MB/s)
docker run -it --device-read-bps /dev/sda:10mb ubuntu bash

# 쓰기 속도 제한 (10MB/s)
docker run -it --device-write-bps /dev/sda:10mb ubuntu bash

# IOPS 제한 (1000 I/O per second)
docker run -it --device-read-iops /dev/sda:1000 ubuntu bash
docker run -it --device-write-iops /dev/sda:1000 ubuntu bash
```

**I/O 사용량 모니터링**

```bash
# Cgroup I/O 통계
cat /sys/fs/cgroup/mygroup/io.stat
# 8:0 rbytes=10485760 wbytes=5242880 rios=1000 wios=500

# Docker 컨테이너 I/O 모니터링
docker stats --no-stream <container_id>
```

#### 12.6.6 systemd와 Cgroup 통합

**systemd는 Cgroup을 완전히 통합 관리**

현대 Linux 시스템에서 systemd가 Cgroup 트리의 유일한 관리자이다.

**Systemd Unit에서 리소스 제한**

```bash
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application

[Service]
ExecStart=/usr/local/bin/myapp
# CPU 제한 (50%)
CPUQuota=50%
# 메모리 제한
MemoryLimit=512M
MemoryMax=1G
# I/O 제한
IOWeight=100

[Install]
WantedBy=multi-user.target
```

**Runtime에 리소스 제한 변경**

```bash
# CPU 제한 설정
systemctl set-property myapp.service CPUQuota=30%

# 메모리 제한 설정
systemctl set-property myapp.service MemoryMax=256M

# 변경사항 확인
systemctl show myapp.service | grep -E "CPU|Memory"

# 영구 적용
systemctl set-property --runtime=false myapp.service CPUQuota=30%
```

**Slice를 이용한 그룹 관리**

```bash
# 사용자 정의 Slice 생성
# /etc/systemd/system/my-apps.slice
[Unit]
Description=My Applications Slice

[Slice]
CPUQuota=80%
MemoryMax=2G

# 서비스를 Slice에 할당
# /etc/systemd/system/app1.service
[Service]
Slice=my-apps.slice
ExecStart=/usr/bin/app1

# Slice 시작
systemctl start my-apps.slice
```

#### 12.6.7 Cgroup 실습

**수동 Cgroup 생성 및 제한**

```bash
# Cgroup v2 예제

# 1. Cgroup 디렉토리 생성
mkdir /sys/fs/cgroup/test_cgroup

# 2. CPU 제한 (50% of 1 core)
echo "50000 100000" > /sys/fs/cgroup/test_cgroup/cpu.max

# 3. 메모리 제한 (256MB)
echo "256M" > /sys/fs/cgroup/test_cgroup/memory.max

# 4. 현재 쉘을 Cgroup에 할당
echo $$ > /sys/fs/cgroup/test_cgroup/cgroup.procs

# 5. CPU 집약적 작업 실행
dd if=/dev/zero of=/dev/null &
PID=$!

# 6. CPU 사용률 확인 (50%로 제한됨)
top -p $PID

# 7. 정리
kill $PID
echo $$ > /sys/fs/cgroup/cgroup.procs  # 원래 Cgroup으로 이동
rmdir /sys/fs/cgroup/test_cgroup
```

**Docker가 Cgroup을 사용하는 방법 확인**

```bash
# Docker 컨테이너 실행
docker run -d --name test --cpus="0.5" --memory="256m" nginx

# 컨테이너의 Cgroup 경로 확인
docker inspect test | grep -i cgroup

# Cgroup 파일 확인
{% raw %}CONTAINER_ID=$(docker inspect -f '{{.Id}}' test){% endraw %}
ls /sys/fs/cgroup/system.slice/docker-${CONTAINER_ID}.scope/

# CPU 제한 확인
cat /sys/fs/cgroup/system.slice/docker-${CONTAINER_ID}.scope/cpu.max
# 50000 100000 (50%)

# 메모리 제한 확인
cat /sys/fs/cgroup/system.slice/docker-${CONTAINER_ID}.scope/memory.max
# 268435456 (256MB)

# 정리
docker rm -f test
```

**Cgroup Best Practices**

1. **항상 리소스 제한 설정**: 컨테이너/프로세스가 시스템 전체를 다운시키지 않도록
2. **메모리 제한 필수**: OOM Killer로부터 호스트 보호
3. **I/O 제한**: 디스크 I/O가 많은 작업에 제한 설정
4. **모니터링**: Cgroup 통계를 주기적으로 확인
5. **systemd 활용**: 가능하면 systemd로 Cgroup 관리

**Cgroup 문제 해결**

```bash
# Cgroup 계층 구조 확인
systemd-cgls

# 특정 Cgroup의 프로세스 목록
cat /sys/fs/cgroup/system.slice/docker.service/cgroup.procs

# Cgroup 이벤트 모니터링
cat /sys/fs/cgroup/mygroup/cgroup.events
# populated: 0 (프로세스가 없음)
# frozen: 0 (freeze되지 않음)

# 메모리 pressure 확인 (Cgroup v2)
cat /sys/fs/cgroup/mygroup/memory.pressure
# some avg10=0.00 avg60=0.00 avg300=0.00 total=0
# full avg10=0.00 avg60=0.00 avg300=0.00 total=0
```

---

**요약**

**Namespaces**는 **격리(Isolation)**를 제공:

- PID: 프로세스 격리
- Mount: 파일시스템 격리
- Network: 네트워크 스택 격리
- UTS: 호스트명 격리
- IPC: IPC 리소스 격리
- User: UID/GID 격리 (보안)
- Cgroup: Cgroup 트리 격리

**Cgroups**는 **리소스 제한(Resource Limiting)**을 제공:

- CPU: CPU 사용량 제한
- Memory: 메모리 사용량 제한
- I/O: 디스크 I/O 제한
- Network: 네트워크 대역폭 제한 (tc와 함께)

**Namespaces + Cgroups = 컨테이너**

Docker와 Kubernetes는 이 두 기술을 조합하여 안전하고 격리된 컨테이너 환경을 제공한다.
