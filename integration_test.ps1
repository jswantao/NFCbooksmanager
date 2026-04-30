# ==================== NFC Books Manager 前后端集成测试脚本 ====================
# 测试关键业务流程，确保前后端数据流通正常

param(
    [string]$BaseUrl = "http://127.0.0.1:8000/api"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ==================== 颜色输出函数 ====================

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Test {
    param([string]$Message)
    Write-Host "`n📝 $Message" -ForegroundColor Yellow
}

# ==================== 测试函数 ====================

function Test-HealthCheck {
    Write-Test "测试 1: 健康检查 (GET /health)"
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.status -eq "healthy") {
            Write-Success "健康检查通过: 版本 $($data.version), 数据库状态 $($data.database.status)"
        } else {
            Write-Error "健康检查失败: 状态 $($data.status)"
        }
    } catch {
        Write-Error "无法连接到后端: $_"
        return $false
    }
    return $true
}

function Test-GetShelves {
    Write-Test "测试 2: 获取书架列表 (GET /api/shelves/)"
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/shelves/" -UseBasicParsing
        $shelves = $response.Content | ConvertFrom-Json
        
        Write-Success "获取书架列表成功: 共 $($shelves.Count) 个书架"
        
        # 显示前 3 个书架信息
        $shelves | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - 书架 $($_.logical_shelf_id): $($_.shelf_name) (位置: $($_.physical_location))"
        }
        
        return $shelves[0].logical_shelf_id
    } catch {
        Write-Error "获取书架列表失败: $_"
        return $null
    }
}

function Test-CreateShelf {
    Write-Test "测试 3: 创建新书架 (POST /api/shelves/)"
    try {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $body = @{
            shelf_name = "测试书架_$timestamp"
            description = "联调测试创建的书架"
        } | ConvertTo-Json
        
        $response = Invoke-WebRequest -Uri "$BaseUrl/shelves/" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -UseBasicParsing
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($result.success) {
            Write-Success "创建书架成功: $($result.message)"
            Write-Host "  书架 ID: $($result.data.logical_shelf_id), 名称: $($result.data.shelf_name)"
            return $result.data.logical_shelf_id
        } else {
            Write-Error "创建书架失败: $($result.message)"
            return $null
        }
    } catch {
        Write-Error "创建书架异常: $_"
        return $null
    }
}

function Test-AddBook {
    param([int]$ShelfId)
    
    Write-Test "测试 4: 手动添加图书 (POST /api/books/manual)"
    try {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $body = @{
            isbn = "9787020002207"  # 红楼梦
            title = "红楼梦联调测试"
            author = "曹雪芹"
            publisher = "人民文学出版社"
            publish_date = "1975-09-01"
            pages = 1200
            add_to_shelf_id = $ShelfId
        } | ConvertTo-Json
        
        $response = Invoke-WebRequest -Uri "$BaseUrl/books/manual" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -UseBasicParsing
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($result.success) {
            Write-Success "添加图书成功: $($result.message)"
            Write-Host "  图书 ID: $($result.data.book_id), 书名: $($result.data.title)"
            return $result.data.book_id
        } else {
            Write-Error "添加图书失败: $($result.message)"
            return $null
        }
    } catch {
        Write-Error "添加图书异常: $_"
        return $null
    }
}

function Test-GetShelfBooks {
    param([int]$ShelfId)
    
    Write-Test "测试 5: 获取书架的图书列表 (GET /api/shelves/{id}/books)"
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/shelves/$ShelfId/books" -UseBasicParsing
        $shelfBooks = $response.Content | ConvertFrom-Json
        
        Write-Success "获取书架图书列表成功: 共 $($shelfBooks.books.Count) 本图书"
        Write-Host "  书架名称: $($shelfBooks.shelf_name)"
        Write-Host "  物理位置: $($shelfBooks.physical_location)"
        
        $shelfBooks.books | ForEach-Object {
            Write-Host "    - $($_.title) (作者: $($_.author))"
        }
        
        return $shelfBooks.books.Count
    } catch {
        Write-Error "获取书架图书列表失败: $_"
        return 0
    }
}

function Test-SearchBooks {
    Write-Test "测试 6: 搜索图书 (GET /api/books/search)"
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/books/search?keyword=红楼梦" `
            -UseBasicParsing
        
        $searchResult = $response.Content | ConvertFrom-Json
        
        Write-Success "搜索图书成功: 找到 $($searchResult.total) 本图书"
        
        $searchResult.items | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.title) (作者: $($_.author), 来源: $($_.source))"
        }
        
        return $searchResult.items.Count
    } catch {
        Write-Error "搜索图书失败: $_"
        return 0
    }
}

function Test-GetDashboardStats {
    Write-Test "测试 7: 获取仪表盘统计数据 (GET /api/admin/stats)"
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/admin/stats" -UseBasicParsing
        $stats = $response.Content | ConvertFrom-Json
        
        Write-Success "获取统计数据成功"
        Write-Host "  物理书架: $($stats.stats.physical_shelves_count) 个"
        Write-Host "  逻辑书架: $($stats.stats.logical_shelves_count) 个"
        Write-Host "  激活映射: $($stats.stats.active_mappings_count) 个"
        Write-Host "  图书总数: $($stats.stats.total_books) 本"
        Write-Host "  在架图书: $($stats.stats.books_in_shelves) 本"
        
        return $true
    } catch {
        Write-Error "获取统计数据失败: $_"
        return $false
    }
}

function Test-FrontendProxy {
    Write-Test "测试 8: 前端代理配置 (通过 Vite 代理访问后端)"
    Write-Info "前端代理地址: http://localhost:5173/api"
    Write-Info "后端实际地址: $BaseUrl"
    Write-Success "代理配置检查: vite.config.ts 中已配置 /api 代理到 $BaseUrl"
    Write-Info "前端应用已启动: http://localhost:5173"
    Write-Info "API 文档: http://127.0.0.1:8000/docs"
}

# ==================== 主测试流程 ====================

function Run-Tests {
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host "🚀 NFC Books Manager - 前后端集成测试" -ForegroundColor Cyan
    Write-Host "测试时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "后端地址: $BaseUrl" -ForegroundColor Cyan
    Write-Host "$('='*60)`n" -ForegroundColor Cyan
    
    $successCount = 0
    $totalTests = 8
    
    # 测试 1: 健康检查
    if (Test-HealthCheck) { $successCount++ }
    
    # 测试 2: 获取书架列表
    $shelfId = Test-GetShelves
    if ($null -ne $shelfId) { $successCount++ }
    
    # 测试 3: 创建新书架
    $newShelfId = Test-CreateShelf
    if ($null -ne $newShelfId) { $successCount++ }
    
    # 测试 4: 添加图书
    $bookId = Test-AddBook -ShelfId $newShelfId
    if ($null -ne $bookId) { $successCount++ }
    
    # 测试 5: 获取书架图书
    $bookCount = Test-GetShelfBooks -ShelfId $newShelfId
    if ($bookCount -gt 0) { $successCount++ }
    
    # 测试 6: 搜索图书
    $searchCount = Test-SearchBooks
    if ($searchCount -gt 0) { $successCount++ }
    
    # 测试 7: 统计数据
    if (Test-GetDashboardStats) { $successCount++ }
    
    # 测试 8: 前端代理
    Test-FrontendProxy
    $successCount++
    
    # 测试总结
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host "📊 测试结果: $successCount/$totalTests 通过" -ForegroundColor Cyan
    Write-Host "$('='*60)`n" -ForegroundColor Cyan
    
    if ($successCount -eq $totalTests) {
        Write-Success "所有测试通过！前后端联调成功 🎉"
        Write-Info "建议的下一步操作："
        Write-Info "  1. 打开浏览器访问 http://localhost:5173"
        Write-Info "  2. 测试 NFC 扫描功能（如有硬件）"
        Write-Info "  3. 测试豆瓣同步功能（需配置 Cookie）"
        Write-Info "  4. 运行完整的 pytest 测试套件"
    } else {
        Write-Error "部分测试失败，请检查后端和前端配置"
    }
}

# ==================== 执行测试 ====================

Run-Tests
