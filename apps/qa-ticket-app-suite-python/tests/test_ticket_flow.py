"""API and browser coverage of the same local ticket workflow."""

import pytest
import requests
from playwright.sync_api import expect

from tests.support import API, TIMEOUT, UI, step


@pytest.mark.api
@pytest.mark.smoke
@pytest.mark.integration
def test_member_ticket_api_lifecycle(member, ticket_title):
    """Members create and update a ticket while auth and version rules hold."""
    with step("未登录创建工单"):
        anonymous = requests.post(
            f"{API}/api/tickets",
            json={"title": ticket_title},
            timeout=TIMEOUT,
        )
        assert anonymous.status_code == 401

    with step("成员登录并创建工单"):
        created = member.post(
            f"{API}/api/tickets",
            json={"title": ticket_title},
            timeout=TIMEOUT,
        )
        assert created.status_code == 201
        ticket = created.json()
        assert ticket["status"] == "open"
        assert ticket["version"] == 1
        path = f"{API}/api/tickets/{ticket['id']}"

    with step("拒绝跨状态更新和旧版本覆盖"):
        invalid = member.patch(
            path,
            json={"version": 1, "status": "resolved"},
            timeout=TIMEOUT,
        )
        assert invalid.status_code == 409
        stale = member.patch(
            path,
            json={"version": 1, "title": "旧版本"},
            timeout=TIMEOUT,
        )
        assert stale.status_code == 409

    with step("推进状态并验证乐观锁版本"):
        changed = member.patch(
            path,
            json={"version": 1, "status": "in_progress"},
            timeout=TIMEOUT,
        )
        assert changed.status_code == 200
        assert changed.json()["version"] == 2

    with step("添加评论并查询详情"):
        comment = member.post(
            f"{path}/comments",
            json={"body": "已补充复现步骤"},
            timeout=TIMEOUT,
        )
        assert comment.status_code == 201
        detail = member.get(path, timeout=TIMEOUT)
        assert detail.status_code == 200
        assert any(
            item["body"] == "已补充复现步骤"
            for item in detail.json()["comments"]
        )


@pytest.mark.smoke
@pytest.mark.integration
def test_member_creates_and_comments_in_browser(page, ticket_title):
    """A member can create, find, and comment on a ticket through the UI."""
    with step("成员登录并进入工作台"):
        page.goto(UI)
        page.get_by_label("用户名").fill("alice")
        page.get_by_label("密码").fill("demo1234")
        page.get_by_role("button", name="登录").click()
        expect(
            page.get_by_role("heading", name="工单工作台")
        ).to_be_visible()

    with step("创建唯一标题工单并查询"):
        page.get_by_role("button", name="新建工单").click()
        dialog = page.get_by_role("dialog", name="新建工单")
        dialog.get_by_label("标题").fill(ticket_title)
        dialog.get_by_role("button", name="创建工单").click()
        expect(page.get_by_text("工单已创建")).to_be_visible()
        page.get_by_label("搜索工单").fill(ticket_title)
        page.get_by_role("button", name=f"查看 {ticket_title}").click()

    with step("添加评论并看到可观察结果"):
        page.get_by_label("添加评论").fill("Python 浏览器验证")
        page.get_by_role("button", name="提交评论").click()
        expect(page.get_by_text("Python 浏览器验证")).to_be_visible()

    with step("刷新后工单仍可查询"):
        page.reload()
        page.get_by_label("搜索工单").fill(ticket_title)
        expect(
            page.get_by_role("button", name=f"查看 {ticket_title}")
        ).to_be_visible()
