import { render } from "@testing-library/react";
import { test, expect } from "vitest";
import { Table } from "../Table";

test("wraps table in scrollable container", () => {
  const { container } = render(
    <Table>
      <tbody>
        <tr>
          <td>cell</td>
        </tr>
      </tbody>
    </Table>,
  );
  const wrapper = container.firstElementChild;
  expect(wrapper?.tagName).toBe("DIV");
  expect(wrapper?.classList.contains("overflow-x-auto")).toBe(true);
  expect(wrapper?.querySelector("table")).toBeTruthy();
});

test("passes through thead and tbody structure", () => {
  const { container } = render(
    <Table>
      <thead>
        <tr>
          <th>Header</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Cell</td>
        </tr>
      </tbody>
    </Table>,
  );
  expect(container.querySelector("thead")).toBeTruthy();
  expect(container.querySelector("tbody")).toBeTruthy();
  expect(container.querySelector("th")?.textContent).toBe("Header");
});
