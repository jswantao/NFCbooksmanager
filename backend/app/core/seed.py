# backend/app/core/seed.py
"""
种子数据初始化模块

在数据库首次创建时自动插入演示数据，
帮助用户快速了解系统的数据结构和映射关系。

种子数据包括：
- 5 个物理书架（模拟书房左右两侧的书架层板）
- 5 个逻辑书架（按图书分类：文学、计算机、推理、哲学、历史）
- 5 条物理-逻辑映射关系（一对一映射）

安全机制：
- 仅在数据库为空时执行（检查逻辑书架数量）
- 已存在数据时自动跳过，不覆盖用户数据
- 异常时自动回滚，保证数据一致性
"""

from sqlalchemy.orm import Session

from app.models.models import (
    PhysicalShelf,
    LogicalShelf,
    PhysicalLogicalMapping,
    BookMetadata,
    LogicalShelfBook,
    BookStatus,
    BookSource,
    MappingType,
)


def seed_database(db: Session) -> None:
    """
    初始化种子数据
    
    在数据库首次创建且无任何数据时自动执行。
    如果检测到已有逻辑书架数据，则跳过初始化。
    
    数据设计思路：
    - 物理书架模拟书房的 5 个层板位置
    - 逻辑书架按常见图书分类创建
    - 映射关系全部为一对一（每个物理位置对应一个分类书架）
    
    异常处理：
    - 任何步骤失败都会回滚整个事务
    - 不影响应用正常启动
    
    Args:
        db: SQLAlchemy 同步数据库会话
    """
    # ---- 检查是否已有数据（幂等性保护） ----
    existing_shelf = db.query(LogicalShelf).first()
    if existing_shelf:
        print("[Seed] 💡 数据库已有数据，跳过种子初始化")
        return

    print("[Seed] 🌱 开始初始化种子数据...")

    try:
        # ========== 创建物理书架 ==========
        physical_shelves = [
            PhysicalShelf(
                location_code="study-left-1",
                location_name="书房-左侧-第1层",
                nfc_tag_uid="04:A1:B2:C3:D4:01",
                description="书房左侧第一层书架，放置中国文学经典",
            ),
            PhysicalShelf(
                location_code="study-left-2",
                location_name="书房-左侧-第2层",
                nfc_tag_uid="04:A1:B2:C3:D4:02",
                description="书房左侧第二层书架，放置计算机科学书籍",
            ),
            PhysicalShelf(
                location_code="study-left-3",
                location_name="书房-左侧-第3层",
                nfc_tag_uid="04:A1:B2:C3:D4:03",
                description="书房左侧第三层书架，放置推理小说",
            ),
            PhysicalShelf(
                location_code="study-right-1",
                location_name="书房-右侧-第1层",
                nfc_tag_uid="04:A1:B2:C3:D4:04",
                description="书房右侧第一层书架，放置哲学思想著作",
            ),
            PhysicalShelf(
                location_code="study-right-2",
                location_name="书房-右侧-第2层",
                nfc_tag_uid="04:A1:B2:C3:D4:05",
                description="书房右侧第二层书架，放置历史人文书籍",
            ),
        ]
        db.add_all(physical_shelves)
        db.flush()  # 刷新以获取自动生成的 physical_shelf_id
        print(f"[Seed]   ✅ 创建 {len(physical_shelves)} 个物理书架")

        # ========== 创建逻辑书架 ==========
        logical_shelves = [
            LogicalShelf(
                shelf_name="中国文学经典",
                description="中国近现代文学经典作品，包括小说、散文、诗歌等",
                is_active=True,
            ),
            LogicalShelf(
                shelf_name="计算机科学",
                description="计算机编程、算法、系统设计等相关书籍",
                is_active=True,
            ),
            LogicalShelf(
                shelf_name="推理小说",
                description="日本和欧美推理小说作品集",
                is_active=True,
            ),
            LogicalShelf(
                shelf_name="哲学思想",
                description="东西方哲学经典著作，包括中国哲学和西方哲学",
                is_active=True,
            ),
            LogicalShelf(
                shelf_name="历史人文",
                description="中国历史和世界历史相关书籍",
                is_active=True,
            ),
        ]
        db.add_all(logical_shelves)
        db.flush()  # 刷新以获取自动生成的 logical_shelf_id
        print(f"[Seed]   ✅ 创建 {len(logical_shelves)} 个逻辑书架")

        # ========== 创建映射关系 ==========
        # 每个物理书架一对一映射到一个逻辑书架
        mapping_pairs = [
            (physical_shelves[0], logical_shelves[0]),  # 左侧第1层 → 中国文学经典
            (physical_shelves[1], logical_shelves[1]),  # 左侧第2层 → 计算机科学
            (physical_shelves[2], logical_shelves[2]),  # 左侧第3层 → 推理小说
            (physical_shelves[3], logical_shelves[3]),  # 右侧第1层 → 哲学思想
            (physical_shelves[4], logical_shelves[4]),  # 右侧第2层 → 历史人文
        ]

        mappings = []
        for physical_shelf, logical_shelf in mapping_pairs:
            mapping = PhysicalLogicalMapping(
                physical_shelf_id=physical_shelf.physical_shelf_id,
                logical_shelf_id=logical_shelf.logical_shelf_id,
                mapping_type=MappingType.ONE_TO_ONE.value,
                is_active=True,
                version=1,
            )
            mappings.append(mapping)

        db.add_all(mappings)
        print(f"[Seed]   ✅ 创建 {len(mappings)} 条映射关系")

        # ========== 提交事务 ==========
        db.commit()
        print("[Seed] ✅ 种子数据初始化完成")

        # ========== 输出统计信息 ==========
        physical_count = db.query(PhysicalShelf).count()
        logical_count = db.query(LogicalShelf).count()
        mapping_count = db.query(PhysicalLogicalMapping).count()
        print(f"[Seed] 📊 统计: 物理书架 {physical_count} | 逻辑书架 {logical_count} | 映射 {mapping_count}")

    except Exception as e:
        # 任何异常都回滚事务，保证数据一致性
        db.rollback()
        print(f"[Seed] ❌ 种子数据初始化失败: {e}")
        print("[Seed]    已回滚所有更改，数据库保持干净状态")
        raise