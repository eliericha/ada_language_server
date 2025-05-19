with Ada.Text_IO;

package body Cycle is

   procedure Baz (t : Integer) return Integer;
   procedure Qux (t : Integer) return Integer;

   procedure Bar (t : Integer) return Integer is
   begin
      return Foo (t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t) +
      Foo(t) + Foo(t);
   end;

   procedure Foo (t : Integer) return Integer is
   begin
      Ada.Text_IO.Put_Line ("Hello");
      Ada.Text_IO.Put_Line ("This");
      Ada.Text_IO.Put_Line ("is");
      Ada.Text_IO.Put_Line ("Multiple");
      Ada.Text_IO.Put_Line ("Put_Line");
      return Foo(t);
   end Foo;

   procedure Baz (t : Integer) return Integer is
   begin
      return Qux (t) + Foo (t);
   end Baz;

   procedure Qux (t : Integer) return Integer is
   begin
      return Baz (t);
   end Qux;

   procedure Bat (t : Integer) return Integer is
   begin
      return Baz (t) + Bat (4);

   end Bat;


end Cycle;