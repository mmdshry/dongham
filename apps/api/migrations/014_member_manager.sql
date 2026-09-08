ALTER TABLE members
  MODIFY role ENUM('owner','manager','member','viewer') NOT NULL DEFAULT 'member';
