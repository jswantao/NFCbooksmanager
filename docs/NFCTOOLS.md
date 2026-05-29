# NFC Tools - API

Welcome to the NFC Tools API.

## 运行配置文件（仅 NFC Tools PRO）

如果想从自己的应用启动一个任务配置文件，可以按下面步骤操作：

1. 选择任务配置文件并获取配置文件名称。

示例代码（选择配置文件）：

```java
// Handle button click
public void onButtonClick(View v) {
   Intent intent = new Intent();
   intent.setAction("com.wakdev.nfctools.pro.action.CHOOSE_PROFILE");
   startActivityForResult(intent, 0);
}

@Override
public void onActivityResult(int requestCode, int resultCode, Intent data) {
   super.onActivityResult(requestCode, resultCode, data);
   if (resultCode == Activity.RESULT_OK) {
      // Recover the name of selected profile
      String myProfileName = data.getStringExtra("intentResultProfileName");
   }
}
```

2. 运行指定的任务配置文件：

```java
String myProfileName = "Your profile name";

Intent intent = new Intent();
intent.setAction("com.wakdev.nfctools.pro.action.RUN_PROFILE");
intent.putExtra("PROFILE_NAME", myProfileName);
startActivity(intent);
```

## WebAPP API — GET 方法

可以使用 `nfc://scan/` 在移动网页中触发 NFC 扫描并将数据回调到你的服务器。

### 1. 定义回调 URL

回调 URL 示例：

```
http://www.yourdomain.tld/index.php?tagid={TAG-ID}&text={NDEF-TEXT}
```

占位符说明（会被 NFC Tools 自动替换）：

- `{TAG-ID}` : NFC 标签 ID
- `{TAG-SIZE}` : 标签当前可用容量
- `{TAG-MAXSIZE}` : 标签最大容量
- `{TAG-TYPE}` : 标签类型，例如 NTAG203
- `{TAG-ISWRITABLE}` : 标签是否可写
- `{TAG-CANMAKEREADONLY}` : 是否可设为只读
- `{NDEF-TEXT}` : 最后读取到的 NDEF 文本记录
- `{NDEF-URI}` : 最后读取到的 NDEF URI 记录

更多占位符将陆续增加。

### 2. 生成 HTML 链接（示例：PHP）

```php
<?php
$callback_url = "http://www.youdomain.tld/";
$callback_url .= "?tagid={TAG-ID}";
$callback_url .= "&text={NDEF-TEXT}";
$encoded_callback_url = urlencode($callback_url);

$link = "nfc://scan/";
$link .= "?callback=" . $encoded_callback_url;
?>
<a href="/<?php echo $link; ?>">Click to scan NFC Tag</a>
```

### 3. 在回调 URL 上接收数据（示例：PHP）

当你的回调被触发时，示例处理代码：

```php
<?php
if (isset($_GET["tagid"])) {
   echo "My TAG ID : " . $_GET["tagid"];
}
if (isset($_GET["text"])) {
   echo "My NDEF text : " . $_GET["text"];
}
?>
```

### 4. 示例与测试页面

在移动设备上测试请访问：

https://www.wakdev.com/contents/apps/nfctools/api/

你也可以下载作者提供的测试页面进行本地调试。

## WebAPP API — POST 方法

（POST 方法示例与说明可在作者页面或后续文档中查看。）
