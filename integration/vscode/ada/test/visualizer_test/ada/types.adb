package body Types is

   procedure FooBar is
      type Foo is new Integer;
      type Qux is new Foo;
      type Bar is new Qux;
      type Baz is new Bar;
      f: Foo := 5;
      b: Bar := 5;
   begin
   end FooBar;

end Types;