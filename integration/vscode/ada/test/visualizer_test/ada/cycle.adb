with Ada.Text_IO;

package body Cycle is

   procedure Tata (t : Integer) return Integer;
   procedure Titi (t : Integer) return Integer;
   procedure Toto (t : Integer) return Integer;

   procedure Tutu (t : Integer) return Integer is
   begin
      return Toto (t) + Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t)+ Toto(t);
   end;

   procedure Toto (t : Integer) return Integer is
   begin
      Ada.Text_IO.Put_Line ("Toto");
      Ada.Text_IO.Put_Line ("Toto");
      Ada.Text_IO.Put_Line ("Toto");
      Ada.Text_IO.Put_Line ("Toto");
      Ada.Text_IO.Put_Line ("Toto");
      return Toto(t);
   end Toto;

   procedure Tata (t : Integer) return Integer is
   begin
      return Titi (t) + Toto (t);
   end Tata;

   procedure Titi (t : Integer) return Integer is
   begin
      return Tata (t);
   end Titi;

   procedure Tyti (t : Integer) return Integer is
   begin
      return Tata (t) + Tyti (4);

   end Tyti;

procedure Trtr (t: Integer) return Integer;

procedure Test(t: Integer; t2: Integer) return Integer is
begin
   return t + t2;
end Test;
procedure Test(t: Integer) return Integer is
begin
   return Test(t, 3);
end Test;

end Cycle;