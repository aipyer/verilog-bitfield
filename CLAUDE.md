# bitfield 项目规则

## Commit Author

所有 commit 和 push 必须使用项目的 author 身份（非本机默认身份）。

**Push 前检查流程：**

每次执行 `git push` 前：

1. 检查 HEAD commit 的 author（`git log --format="%an <%ae>" -1`）
2. 如果 author 不是项目的 author，**暂停 push**，提醒用户
3. 由用户决定：
   - 修正作者后重推
   - 跳过本次 push

**不得 push 之后再回头修正。**

## Tag Rule

Tag 不带 `v` 前缀，格式为纯语义版本号（如 `1.1.1`）。

## 注意

CLAUDE.md 不硬编码项目 identity（author name/email），以运行时检查为准。
