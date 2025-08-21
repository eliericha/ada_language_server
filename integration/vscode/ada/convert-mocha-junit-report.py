#! env python
"""This tool wraps around the e3.testsuite XUnit report import feature to customize test
naming based on the reports obtained in VS Code testing from the mocha-junit-reporter
module."""

import xml.etree.ElementTree as ET

from e3.testsuite.report.xunit import XUnitImporter, XUnitImporterApp


class XUnitImporterCustomTestNaming(XUnitImporter):

    def run(self, filename: str) -> None:
        # Process `filename` to move <system-out> and <system-err> content to <testcase>
        # error/failure/skipped nodes as these are not supported by the importer.

        tree = ET.parse(filename)
        root = tree.getroot()

        # Move <system-out> and <system-err> content to error/failure/skipped nodes
        for testcase in root.findall(".//testcase"):
            # Find error, failure, or skipped nodes
            target_node = None
            for tag in ["error", "failure", "skipped"]:
                node = testcase.find(tag)
                if node is not None:
                    target_node = node
                    break

            if target_node is not None:
                # Collect content from system-out and system-err
                additional_content = []

                for tag in ["system-out", "system-err"]:
                    for node in testcase.findall(tag):
                        if node.text and node.text.strip():
                            title = (
                                "System Output"
                                if tag == "system-out"
                                else "System Error"
                            )
                            additional_content.append(
                                f"\n\n--- {title} ---\n{node.text.strip()}"
                            )
                        testcase.remove(node)

                # Append to body of the target node if there's additional content
                if additional_content:
                    current_text = target_node.text or ""
                    new_text = current_text + "".join(additional_content)
                    target_node.text = new_text
            else:
                # If no error/failure/skipped node, just remove system-out and
                # system-err
                for tag in ["system-out", "system-err"]:
                    for node in testcase.findall(tag):
                        testcase.remove(node)

        # Write back the cleaned XML to the same file
        tree.write(filename, encoding="utf-8", xml_declaration=True)

        return super().run(filename)

    def get_test_name(
        self,
        testsuite_name: str,
        testcase_name: str,
        classname: str | None = None,
    ) -> str:
        """Override naming scheme to ignore the testcase name because it
        duplicates the information from the testsuite name and the classname
        attribute."""
        return super().get_test_name(testsuite_name, "", classname)


class MochaJUnitImporterApp(XUnitImporterApp):

    def create_importer(self) -> XUnitImporter:
        return XUnitImporterCustomTestNaming(self.index, self.xfails)


if __name__ == "__main__":
    MochaJUnitImporterApp().run()
